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
  getSubscriptionOffer,
  purchaseAnnual,
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
const extraUserIds: string[] = [];

async function createExtraUser(prefix: string) {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${suffix}@test.local`,
      referralCode: `${prefix.toUpperCase()}${suffix.slice(0, 8)}`,
    },
  });
  extraUserIds.push(user.id);
  return user;
}

describe("subscription lifecycle and entitlements", () => {
  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `TEST_VIP_${suffix.slice(0, 8)}`,
        name: "Test VIP",
        prices: {
          create: [
            { currency: "INR", amountMinor: 99_900, trialAmountMinor: 900, countryCodes: ["IN"] },
            { currency: "USD", amountMinor: 9_999, trialAmountMinor: 99, countryCodes: ["US"] },
            { currency: "EUR", amountMinor: 8_999, trialAmountMinor: 99, countryCodes: ["DE"] },
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
    await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
    await prisma.user.delete({ where: { id: trialUserId } });
    await prisma.user.delete({ where: { id: reminderUserId } });
    await prisma.user.delete({ where: { id: failedUserId } });
    await prisma.series.delete({ where: { id: seriesId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("starts one trial and refuses a second claim", async () => {
    const first = await startTrial(
      trialUserId,
      `TEST_VIP_${suffix.slice(0, 8)}`,
      "INR",
      "IN",
      undefined,
      new Date(),
      `device-${suffix}`,
    );
    await expect(
      startTrial(
        trialUserId,
        `TEST_VIP_${suffix.slice(0, 8)}`,
        "INR",
        "IN",
        undefined,
        new Date(),
        `device-${suffix}`,
      ),
    ).rejects.toThrow("TRIAL_ALREADY_USED");
    expect(
      await prisma.subscription.count({ where: { userId: trialUserId, status: "TRIALING" } }),
    ).toBe(1);
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: first.id, kind: "TRIAL" },
      }),
    ).toBe(1);
  });

  it("records a failed trial charge without leaving entitlement", async () => {
    const user = await createExtraUser("trial-failure");
    class FailingTrialProvider extends DevSubscriptionProvider {
      override async createTrialCheckout(_input: CheckoutInput): Promise<never> {
        throw new Error("TEST_TRIAL_FAILURE");
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new FailingTrialProvider());
    await expect(startTrial(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR")).rejects.toThrow(
      "TEST_TRIAL_FAILURE",
    );
    providerSpy.mockRestore();
    const subscription = await prisma.subscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(subscription.status).toBe("EXPIRED");
    expect(
      await prisma.subscriptionInvoice.findFirstOrThrow({
        where: { subscriptionId: subscription.id, kind: "TRIAL" },
      }),
    ).toMatchObject({ status: "FAILED", providerRef: null });
    expect((await resolveEpisodeEntitlement(user.id, lockedEpisodeId)).entitled).toBe(false);
  });

  it("keeps a trial claim after the account is recreated", async () => {
    const user = await createExtraUser("recreated");
    const email = user.email;
    await startTrial(
      user.id,
      `TEST_VIP_${suffix.slice(0, 8)}`,
      "INR",
      "IN",
      undefined,
      new Date(),
      `recreated-device-${suffix}`,
    );
    await prisma.user.delete({ where: { id: user.id } });
    const replacement = await prisma.user.create({
      data: {
        email,
        referralCode: `RE${suffix.slice(0, 6)}`,
      },
    });
    extraUserIds.push(replacement.id);
    await expect(
      startTrial(
        replacement.id,
        `TEST_VIP_${suffix.slice(0, 8)}`,
        "INR",
        "IN",
        undefined,
        new Date(),
        `new-device-${suffix}`,
      ),
    ).rejects.toThrow("TRIAL_ALREADY_USED");
  });

  it("charges only the winner of a concurrent trial claim", async () => {
    const user = await createExtraUser("trial-race");
    let charges = 0;
    class CountingProvider extends DevSubscriptionProvider {
      override async createTrialCheckout(input: CheckoutInput) {
        charges += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return super.createTrialCheckout(input);
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new CountingProvider());
    const results = await Promise.allSettled([
      startTrial(
        user.id,
        `TEST_VIP_${suffix.slice(0, 8)}`,
        "INR",
        "IN",
        undefined,
        new Date(),
        `race-device-${suffix}`,
      ),
      startTrial(
        user.id,
        `TEST_VIP_${suffix.slice(0, 8)}`,
        "INR",
        "IN",
        undefined,
        new Date(),
        `race-device-${suffix}`,
      ),
    ]);
    providerSpy.mockRestore();
    expect(charges).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: "TRIAL_ALREADY_USED" }),
    });
    const winner = results.find((result) => result.status === "fulfilled");
    if (!winner || winner.status !== "fulfilled") throw new Error("missing trial winner");
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: winner.value.id, kind: "TRIAL", status: "PAID" },
      }),
    ).toBe(1);
  });

  it("creates one paid annual subscription and is idempotent", async () => {
    const user = await createExtraUser("annual");
    let charges = 0;
    class CountingAnnualProvider extends DevSubscriptionProvider {
      override async chargeRenewal(input: CheckoutInput) {
        charges += 1;
        return super.chargeRenewal(input);
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new CountingAnnualProvider());
    const first = await purchaseAnnual(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    const second = await purchaseAnnual(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    providerSpy.mockRestore();
    expect(second.id).toBe(first.id);
    expect(charges).toBe(1);
    expect(first.status).toBe("ACTIVE");
    await expect(
      startTrial(
        user.id,
        `TEST_VIP_${suffix.slice(0, 8)}`,
        "INR",
        "IN",
        undefined,
        new Date(),
        `annual-trial-${suffix}`,
      ),
    ).rejects.toThrow("SUBSCRIPTION_EXISTS");
    expect(
      await prisma.subscription.count({
        where: { userId: user.id, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: first.id, kind: "RENEWAL", status: "PAID" },
      }),
    ).toBe(1);
  });

  it("keeps a first annual purchase locked until settlement", async () => {
    const user = await createExtraUser("annual-pending");
    let releaseCharge!: () => void;
    const chargeStarted = new Promise<void>((resolve) => {
      releaseCharge = resolve;
    });
    class DelayedAnnualProvider extends DevSubscriptionProvider {
      override async chargeRenewal(input: CheckoutInput) {
        await chargeStarted;
        return super.chargeRenewal(input);
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new DelayedAnnualProvider());
    const purchase = purchaseAnnual(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const pending = await prisma.subscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(pending.status).toBe("ACTIVE");
    expect((await resolveEpisodeEntitlement(user.id, lockedEpisodeId)).reason).toBe("LOCKED");
    releaseCharge();
    await purchase;
    providerSpy.mockRestore();
    expect((await resolveEpisodeEntitlement(user.id, lockedEpisodeId)).reason).toBe("SUBSCRIPTION");
  });

  it("keeps a failed annual purchase locked", async () => {
    const user = await createExtraUser("annual-failure");
    class FailingAnnualProvider extends DevSubscriptionProvider {
      override async chargeRenewal(_input: CheckoutInput): Promise<never> {
        throw new Error("TEST_ANNUAL_FAILURE");
      }
    }
    const providerSpy = vi
      .spyOn(providerModule, "subscriptionProvider")
      .mockReturnValue(new FailingAnnualProvider());
    await expect(purchaseAnnual(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR")).rejects.toThrow(
      "TEST_ANNUAL_FAILURE",
    );
    providerSpy.mockRestore();
    const failed = await prisma.subscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(failed.status).toBe("EXPIRED");
    expect((await resolveEpisodeEntitlement(user.id, lockedEpisodeId)).reason).toBe("LOCKED");
  });

  it("resolves corrected localized annual prices", async () => {
    const usd = await getSubscriptionOffer(`TEST_VIP_${suffix.slice(0, 8)}`, "USD");
    const eur = await getSubscriptionOffer(`TEST_VIP_${suffix.slice(0, 8)}`, "EUR");
    expect(usd?.price.amountMinor).toBe(9_999);
    expect(eur?.price.amountMinor).toBe(8_999);
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

  it("retries past-due renewals within grace and expires after grace", async () => {
    const retryUser = await createExtraUser("dunning-retry");
    const retry = await startTrial(retryUser.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: retry.id },
      data: {
        status: "PAST_DUE",
        currentPeriodEnd: new Date(Date.now() - 1_000),
        pastDueSince: new Date(Date.now() - 60 * 60 * 1_000),
      },
    });
    const retried = await runSubscriptionCron();
    expect(retried.converted).toBeGreaterThanOrEqual(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: retry.id } })).status).toBe(
      "ACTIVE",
    );

    const expireUser = await createExtraUser("dunning-expire");
    const expiring = await startTrial(expireUser.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: expiring.id },
      data: {
        status: "PAST_DUE",
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
        pastDueSince: new Date(Date.now() - 100 * 60 * 60 * 1_000),
      },
    });
    await runSubscriptionCron();
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: expiring.id } })).status,
    ).toBe("EXPIRED");
  });

  it("anchors late renewals to the previous period boundary", async () => {
    const user = await createExtraUser("boundary");
    const subscription = await startTrial(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    const boundary = new Date("2025-01-15T00:00:00.000Z");
    const now = new Date("2026-02-20T00:00:00.000Z");
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: new Date("2024-01-15T00:00:00.000Z"),
        currentPeriodEnd: boundary,
      },
    });
    await runSubscriptionCron(now);
    const renewed = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(renewed.currentPeriodStart).toEqual(boundary);
    expect(renewed.currentPeriodEnd).toEqual(new Date("2027-01-15T00:00:00.000Z"));
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

  it("settles a webhook renewal once when cron already processed it", async () => {
    const user = await createExtraUser("webhook-renewal");
    const subscription = await startTrial(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - 1_000) },
    });
    await runSubscriptionCron();
    const renewed = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    const invoice = await prisma.subscriptionInvoice.findFirstOrThrow({
      where: { subscriptionId: subscription.id, kind: "RENEWAL", status: "PAID" },
    });
    const periodEnd = renewed.currentPeriodEnd;
    const result = await processSubscriptionWebhook(
      "DEV",
      {
        eventId: `renewal-event-${suffix}`,
        type: "PAYMENT_SUCCEEDED",
        providerRef: invoice.providerRef!,
      },
      { invoiceId: invoice.id },
    );
    expect(result).toMatchObject({ handled: false, ignored: true });
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: subscription.id, kind: "RENEWAL" },
      }),
    ).toBe(1);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } }))
        .currentPeriodEnd,
    ).toEqual(periodEnd);
  });

  it("ignores webhook transitions against expired subscriptions", async () => {
    const user = await createExtraUser("webhook-expired");
    const subscription = await startTrial(user.id, `TEST_VIP_${suffix.slice(0, 8)}`, "INR");
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED", providerRef: `expired-provider-${suffix}` },
    });
    const result = await processSubscriptionWebhook(
      "DEV",
      {
        eventId: `expired-event-${suffix}`,
        type: "PAYMENT_SUCCEEDED",
        providerRef: subscription.providerRef!,
      },
      {},
    );
    expect(result).toMatchObject({ handled: false, ignored: true });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe("EXPIRED");
    expect(
      await prisma.subscriptionEvent.findFirst({
        where: { subscriptionId: subscription.id, reason: { contains: "Ignored illegal" } },
      }),
    ).not.toBeNull();
  });
});
