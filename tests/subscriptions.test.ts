import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.OTP_DEV_CODE ??= "123456";
  process.env.CRON_SECRET ??= "test-cron-secret";
});

import { prisma } from "../src/server/db";
import {
  adminExtendSubscription,
  cancelSubscription,
  processSubscriptionWebhook,
  runSubscriptionCron,
  startTrial,
} from "../src/server/subscriptions";
import { resolveEpisodeEntitlement } from "../src/server/entitlements";
import * as providerModule from "../src/server/subscription-providers";
import { DevSubscriptionProvider } from "../src/server/subscription-providers";
import type { CheckoutInput } from "../src/server/subscription-providers";

const suffix = crypto.randomUUID();
let planId = "";
let priceId = "";
let trialUserId = "";
let reminderUserId = "";
let failedUserId = "";
let seriesId = "";
let lockedEpisodeId = "";
let freeEpisodeId = "";

describe("subscription lifecycle and entitlements", () => {
  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `TEST_VIP_${suffix.slice(0, 8)}`,
        name: "Test VIP",
        prices: {
          create: [
            { currency: "INR", amountMinor: 99_900, trialAmountMinor: 900, countryCodes: ["IN"] },
          ],
        },
      },
      include: { prices: true },
    });
    planId = plan.id;
    priceId = plan.prices[0].id;
    const user = await prisma.user.create({
      data: {
        email: `subscription-${suffix}@test.local`,
        referralCode: `SUB${suffix.slice(0, 8)}`,
      },
    });
    trialUserId = user.id;
    const reminderUser = await prisma.user.create({
      data: {
        email: `reminder-${suffix}@test.local`,
        referralCode: `REM${suffix.slice(0, 8)}`,
      },
    });
    reminderUserId = reminderUser.id;
    const failedUser = await prisma.user.create({
      data: {
        email: `failed-${suffix}@test.local`,
        referralCode: `FAIL${suffix.slice(0, 8)}`,
      },
    });
    failedUserId = failedUser.id;
    const series = await prisma.series.create({
      data: {
        slug: `subscription-${suffix}`,
        title: "Subscription Test",
        synopsis: "Test",
        posterUrl: "",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 1,
      },
    });
    seriesId = series.id;
    const [free, locked] = await Promise.all([
      prisma.episode.create({
        data: {
          seriesId,
          number: 1,
          title: "Free",
          durationSec: 1,
          hlsPath: "sample.mp4",
          thumbnailUrl: "",
          isFree: true,
          coinPrice: 10,
        },
      }),
      prisma.episode.create({
        data: {
          seriesId,
          number: 2,
          title: "Locked",
          durationSec: 1,
          hlsPath: "sample.mp4",
          thumbnailUrl: "",
          coinPrice: 10,
        },
      }),
    ]);
    freeEpisodeId = free.id;
    lockedEpisodeId = locked.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: trialUserId } });
    await prisma.user.delete({ where: { id: reminderUserId } });
    await prisma.user.delete({ where: { id: failedUserId } });
    await prisma.series.delete({ where: { id: seriesId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("starts one trial with exactly one paid trial invoice", async () => {
    const first = await startTrial(trialUserId, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    const second = await startTrial(trialUserId, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    expect(second.id).toBe(first.id);
    expect(
      await prisma.subscription.count({ where: { userId: trialUserId, status: "TRIALING" } }),
    ).toBe(1);
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: first.id, kind: "TRIAL" },
      }),
    ).toBe(1);
  });

  it("reminds and converts an expired trial only once", async () => {
    const current = await prisma.subscription.findFirstOrThrow({ where: { userId: trialUserId } });
    const subscription = await prisma.subscription.update({
      where: { id: current.id },
      data: {
        trialEndsAt: new Date(Date.now() - 1_000),
        currentPeriodEnd: new Date(Date.now() - 1_000),
      },
    });
    const first = await runSubscriptionCron();
    const second = await runSubscriptionCron();
    expect(first.converted).toBe(1);
    expect(second.converted).toBe(0);
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: subscription.id, kind: "RENEWAL" },
      }),
    ).toBe(1);
  });

  it("sends a trial reminder once", async () => {
    const reminder = await startTrial(reminderUserId, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: reminder.id },
      data: {
        trialEndsAt: new Date(Date.now() + 60 * 60 * 1_000),
        currentPeriodEnd: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    const first = await runSubscriptionCron();
    const second = await runSubscriptionCron();
    expect(first.reminders).toBe(1);
    expect(second.reminders).toBe(0);
    expect(
      await prisma.notificationLog.count({
        where: { subscriptionId: reminder.id, kind: "SUBSCRIPTION_TRIAL_END" },
      }),
    ).toBe(1);
  });

  it("moves a failed renewal to past due while retaining access", async () => {
    const subscription = await startTrial(failedUserId, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        trialEndsAt: new Date(Date.now() - 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 1_000),
      },
    });
    class FailingProvider extends DevSubscriptionProvider {
      override async chargeRenewal(_input: CheckoutInput): Promise<never> {
        throw new Error("TEST_RENEWAL_FAILURE");
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new FailingProvider());
    await runSubscriptionCron();
    providerSpy.mockRestore();
    const pastDue = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(pastDue.status).toBe("PAST_DUE");
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: new Date(Date.now() + 86_400_000) },
    });
    expect((await resolveEpisodeEntitlement(failedUserId, lockedEpisodeId)).entitled).toBe(true);
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: subscription.id, kind: "RENEWAL", status: "FAILED" },
      }),
    ).toBe(1);
  });

  it("resolves free, coin, subscription, and expired access", async () => {
    const free = await resolveEpisodeEntitlement(trialUserId, freeEpisodeId);
    expect(free).toMatchObject({ entitled: true, reason: "FREE" });
    const active = await prisma.subscription.findFirstOrThrow({ where: { userId: trialUserId } });
    await prisma.episodeUnlock.create({
      data: { userId: trialUserId, episodeId: lockedEpisodeId, source: "COIN" },
    });
    const coin = await resolveEpisodeEntitlement(trialUserId, lockedEpisodeId);
    expect(coin).toMatchObject({ entitled: true, reason: "COIN" });
    await prisma.episodeUnlock.delete({
      where: { userId_episodeId: { userId: trialUserId, episodeId: lockedEpisodeId } },
    });
    const subscription = await resolveEpisodeEntitlement(trialUserId, lockedEpisodeId);
    expect(subscription.entitled).toBe(true);
    await prisma.subscription.update({
      where: { id: active.id },
      data: { status: "EXPIRED", currentPeriodEnd: new Date(Date.now() - 1_000) },
    });
    const expired = await resolveEpisodeEntitlement(trialUserId, lockedEpisodeId);
    expect(expired).toMatchObject({ entitled: false, reason: "LOCKED" });
  });

  it("keeps canceled access through the period and records admin extension", async () => {
    const current = await prisma.subscription.findFirstOrThrow({ where: { userId: trialUserId } });
    const subscription = await prisma.subscription.update({
      where: { id: current.id },
      data: {
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
        cancelAtPeriodEnd: false,
      },
    });
    await cancelSubscription(trialUserId, subscription.id);
    expect((await resolveEpisodeEntitlement(trialUserId, lockedEpisodeId)).entitled).toBe(true);
    const before = await prisma.subscriptionEvent.count({
      where: { subscriptionId: subscription.id },
    });
    await adminExtendSubscription(subscription.id, trialUserId, 7);
    expect(
      await prisma.subscriptionEvent.count({ where: { subscriptionId: subscription.id } }),
    ).toBe(before + 1);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1_000) },
    });
    await runSubscriptionCron();
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe("EXPIRED");
  });

  it("ignores replayed webhook events", async () => {
    const current = await prisma.subscription.findFirstOrThrow({ where: { userId: trialUserId } });
    const subscription = await prisma.subscription.update({
      where: { id: current.id },
      data: { status: "ACTIVE", providerRef: `webhook-${suffix}` },
    });
    const event = {
      eventId: `event-${suffix}`,
      type: "PAYMENT_FAILED" as const,
      providerRef: subscription.providerRef!,
    };
    expect(await processSubscriptionWebhook("DEV", event, event)).toMatchObject({
      duplicate: false,
    });
    expect(await processSubscriptionWebhook("DEV", event, event)).toMatchObject({
      duplicate: true,
    });
  });
});
