import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "account-deletion-test-session-secret";
  process.env.OTP_DEV_CODE = "123456";
  process.env.BREVO_API_KEY = "";
  return { token: "" };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.token ? { value: cookieState.token } : undefined),
    set: (_name: string, value: string) => {
      cookieState.token = value;
    },
    delete: () => {
      cookieState.token = "";
    },
  }),
}));

import { POST as deleteAccountPost } from "../src/app/api/account/delete/route";
import { POST as verifyPost } from "../src/app/api/auth/verify/route";
import { findOrCreateUser, getSession, issueSession } from "../src/server/auth";
import { prisma } from "../src/server/db";
import { hasUsedTrial } from "../src/server/subscriptions";
import {
  anonymizedDeletedAccountIdentifier,
  anonymizedTrialClaimDeviceFingerprint,
  anonymizedTrialClaimEmail,
} from "../src/server/trial-claim-privacy";

const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const email = `account-delete-${suffix}@test.local`;
const phone = `+1555${suffix}`;
const deviceId = `account-delete-${suffix}`;
let userId = "";
let activeUserId = "";
let referrerId = "";
let referrerCode = "";
let replacementUserId = "";
let replacementPhoneUserId = "";
const autoRenewUserIds: string[] = [];
let seriesId = "";
let episodeId = "";
let planId = "";
let priceId = "";
let bundleId = "";
let subscriptionId = "";
let incompleteSubscriptionId = "";

function deleteRequest(body: unknown) {
  return deleteAccountPost(
    new Request("http://localhost/api/account/delete", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function createAutoRenewUser(
  prefix: string,
  status: "ACTIVE" | "PAST_DUE",
  currentPeriodEnd: Date,
  cancelAtPeriodEnd = false,
) {
  const user = await prisma.user.create({
    data: {
      email: `account-${prefix}-${suffix}@test.local`,
      referralCode: `A${prefix.toUpperCase()}${suffix}`,
    },
  });
  autoRenewUserIds.push(user.id);
  await prisma.subscription.create({
    data: {
      userId: user.id,
      planId,
      priceId,
      status,
      cancelAtPeriodEnd,
      trialEndsAt: new Date(),
      currentPeriodStart: new Date(Date.now() - 30 * 86_400_000),
      currentPeriodEnd,
      provider: "DEV",
      currency: "INR",
    },
  });
  return user.id;
}

describe("account deletion", () => {
  beforeAll(async () => {
    const referrer = await prisma.user.create({
      data: {
        email: `account-referrer-${suffix}@test.local`,
        referralCode: `AR${suffix}`,
      },
    });
    referrerId = referrer.id;
    const [user, activeUser] = await Promise.all([
      prisma.user.create({
        data: {
          email,
          phone,
          name: "Account to delete",
          passwordHash: "test-password-hash",
          referralCode: `AD${suffix}`,
          referredById: referrerId,
        },
      }),
      prisma.user.create({
        data: {
          email: `account-active-${suffix}@test.local`,
          referralCode: `AA${suffix}`,
        },
      }),
    ]);
    userId = user.id;
    activeUserId = activeUser.id;
    referrerCode = referrer.referralCode;

    const plan = await prisma.plan.create({
      data: {
        code: `ACCOUNT_DELETE_${suffix}`,
        name: "Account deletion test plan",
        prices: {
          create: {
            currency: "INR",
            amountMinor: 1_000,
            trialAmountMinor: 100,
            countryCodes: ["IN"],
          },
        },
      },
      include: { prices: true },
    });
    planId = plan.id;
    priceId = plan.prices[0].id;
    const bundle = await prisma.coinBundle.create({
      data: { coins: 100, priceMinor: 1_000 },
    });
    bundleId = bundle.id;
    const series = await prisma.series.create({
      data: {
        slug: `account-delete-${suffix}`,
        title: "Account Deletion Test",
        synopsis: "Fixture",
        posterUrl: "/fixture.jpg",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        isPublished: true,
        episodes: {
          create: {
            number: 1,
            title: "Fixture episode",
            hlsPath: "episodes/account-delete.m3u8",
            thumbnailUrl: "/fixture.jpg",
            durationSec: 30,
            coinPrice: 10,
            publishedAt: new Date(),
          },
        },
      },
      include: { episodes: true },
    });
    seriesId = series.id;
    episodeId = series.episodes[0].id;

    const now = new Date();
    const [activeSubscription, retainedSubscription] = await Promise.all([
      prisma.subscription.create({
        data: {
          userId: activeUserId,
          planId,
          priceId,
          status: "ACTIVE",
          trialEndsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
          provider: "DEV",
          currency: "INR",
        },
      }),
      prisma.subscription.create({
        data: {
          userId,
          planId,
          priceId,
          status: "CANCELED",
          cancelAtPeriodEnd: true,
          trialEndsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
          provider: "DEV",
          currency: "INR",
        },
      }),
    ]);
    subscriptionId = retainedSubscription.id;
    const incompleteSubscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        priceId,
        status: "INCOMPLETE",
        trialEndsAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
        provider: "DEV",
        currency: "INR",
      },
    });
    incompleteSubscriptionId = incompleteSubscription.id;
    await prisma.subscriptionWebhookEvent.create({
      data: {
        provider: "DEV",
        providerEventId: `account-delete-event-${suffix}`,
        subscriptionId: retainedSubscription.id,
        payload: { email },
      },
    });

    await prisma.purchase.create({
      data: {
        userId,
        bundleId,
        provider: "GOOGLE_PLAY",
        providerRef: `account-delete-purchase-${suffix}`,
        status: "COMPLETED",
        coinsGranted: 100,
      },
    });
    await prisma.coinTransaction.create({
      data: {
        userId,
        delta: 100,
        type: "PURCHASE",
        balanceAfter: 100,
        refType: "purchase",
        refId: `account-delete-purchase-${suffix}`,
      },
    });
    await prisma.episodeUnlock.create({
      data: { userId, episodeId, source: "COIN" },
    });
    await prisma.trialClaim.create({
      data: { userId, email, deviceFingerprint: `fingerprint-${suffix}` },
    });
    await prisma.deviceToken.create({
      data: { userId, token: `account-delete-token-${suffix}` },
    });
    await prisma.watchProgress.create({
      data: { userId, episodeId, positionSec: 12 },
    });
    await prisma.watchlistItem.create({
      data: { userId, seriesId },
    });
    await prisma.episodeLike.create({
      data: { userId, episodeId },
    });
    await prisma.userActivityDay.create({
      data: { userId, day: new Date("2026-01-01T00:00:00.000Z") },
    });
    await prisma.dailyCheckin.create({
      data: { userId, day: new Date("2026-01-02T00:00:00.000Z"), streak: 1 },
    });
    await prisma.notificationLog.create({
      data: { userId, message: "Test notification" },
    });
    await prisma.analyticsEvent.create({
      data: { name: "app_open", userId, deviceId },
    });
    await prisma.otpChallenge.createMany({
      data: [email, phone].map((identifier) => ({
        identifier,
        codeHash: "unused",
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });

    expect(activeSubscription.userId).toBe(activeUserId);
  });

  afterAll(async () => {
    cookieState.token = "";
    await prisma.analyticsEvent.deleteMany({ where: { deviceId } });
    await prisma.otpChallenge.deleteMany({ where: { identifier: { in: [email, phone] } } });
    await prisma.subscriptionWebhookEvent.deleteMany({
      where: { providerEventId: `account-delete-event-${suffix}` },
    });
    await prisma.trialClaim.deleteMany({
      where: {
        email: {
          in: [
            email,
            anonymizedTrialClaimEmail(email),
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            userId,
            activeUserId,
            referrerId,
            replacementUserId,
            replacementPhoneUserId,
            ...autoRenewUserIds,
          ].filter(Boolean),
        },
      },
    });
    await prisma.series.deleteMany({ where: { id: seriesId } });
    await prisma.coinBundle.deleteMany({ where: { id: bundleId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("returns 401 for an unauthenticated request", async () => {
    cookieState.token = "";
    const response = await deleteRequest({ confirm: "DELETE" });
    expect(response.status).toBe(401);
  });

  it("requires the exact deletion confirmation", async () => {
    await issueSession({ userId, role: "USER" });
    const response = await deleteRequest({ confirm: "delete" });
    expect(response.status).toBe(400);
  });

  it("blocks active auto-renewing subscriptions", async () => {
    await issueSession({ userId: activeUserId, role: "USER" });
    const response = await deleteRequest({ confirm: "DELETE" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { message: "Cancel your VIP auto-renew first" },
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: activeUserId } })).toMatchObject({
      isDisabled: false,
    });
  });

  it("blocks PAST_DUE subscriptions with auto-renew enabled", async () => {
    const dueUserId = await createAutoRenewUser(
      "past-due",
      "PAST_DUE",
      new Date(Date.now() - 86_400_000),
    );
    await issueSession({ userId: dueUserId, role: "USER" });

    const response = await deleteRequest({ confirm: "DELETE" });

    expect(response.status).toBe(409);
  });

  it("blocks expired ACTIVE subscriptions with auto-renew enabled", async () => {
    const expiredUserId = await createAutoRenewUser(
      "expired-active",
      "ACTIVE",
      new Date(Date.now() - 86_400_000),
    );
    await issueSession({ userId: expiredUserId, role: "USER" });

    const response = await deleteRequest({ confirm: "DELETE" });

    expect(response.status).toBe(409);
  });

  it("allows deletion when an ACTIVE subscription is already set to cancel", async () => {
    const cancelingUserId = await createAutoRenewUser(
      "canceling",
      "ACTIVE",
      new Date(Date.now() + 30 * 86_400_000),
      true,
    );
    await issueSession({ userId: cancelingUserId, role: "USER" });

    const response = await deleteRequest({ confirm: "DELETE" });

    expect(response.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: cancelingUserId } })).toMatchObject({
      email: anonymizedDeletedAccountIdentifier(
        "email",
        `account-canceling-${suffix}@test.local`,
        cancelingUserId,
      ),
      isDisabled: true,
    });
  });

  it("anonymizes the account, removes personal activity, retains financial records, and permits a new login", async () => {
    await issueSession({ userId, role: "USER" });
    const response = await deleteRequest({ confirm: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(cookieState.token).toBe("");

    const deletedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(deletedUser).toMatchObject({
      email: anonymizedDeletedAccountIdentifier("email", email, userId),
      phone: anonymizedDeletedAccountIdentifier("phone", phone, userId),
      name: null,
      passwordHash: null,
      isDisabled: true,
      referredById: referrerId,
    });
    const [
      deviceTokens,
      progress,
      watchlist,
      likes,
      activityDays,
      checkins,
      notifications,
      purchases,
      transactions,
      unlocks,
      subscriptions,
      analyticsEvent,
      webhookEvent,
      trialClaim,
      otpChallenges,
    ] = await Promise.all([
      prisma.deviceToken.count({ where: { userId } }),
      prisma.watchProgress.count({ where: { userId } }),
      prisma.watchlistItem.count({ where: { userId } }),
      prisma.episodeLike.count({ where: { userId } }),
      prisma.userActivityDay.count({ where: { userId } }),
      prisma.dailyCheckin.count({ where: { userId } }),
      prisma.notificationLog.count({ where: { userId } }),
      prisma.purchase.count({ where: { userId } }),
      prisma.coinTransaction.count({ where: { userId } }),
      prisma.episodeUnlock.count({ where: { userId } }),
      prisma.subscription.count({ where: { userId } }),
      prisma.analyticsEvent.findFirst({ where: { deviceId } }),
      prisma.subscriptionWebhookEvent.findUnique({
        where: { providerEventId: `account-delete-event-${suffix}` },
      }),
      prisma.trialClaim.findUnique({
        where: { email: anonymizedTrialClaimEmail(email) },
      }),
      prisma.otpChallenge.count({ where: { identifier: { in: [email, phone] } } }),
    ]);
    expect([
      deviceTokens,
      progress,
      watchlist,
      likes,
      activityDays,
      checkins,
      notifications,
      otpChallenges,
    ]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([purchases, transactions, unlocks, subscriptions]).toEqual([1, 1, 1, 2]);
    expect(
      await prisma.subscription.findUniqueOrThrow({ where: { id: incompleteSubscriptionId } }),
    ).toMatchObject({ status: "CANCELED" });
    expect(analyticsEvent?.userId).toBeNull();
    expect(webhookEvent?.payload).toBeNull();
    expect(trialClaim).toMatchObject({
      userId: null,
      email: anonymizedTrialClaimEmail(email),
      deviceFingerprint: anonymizedTrialClaimDeviceFingerprint(`fingerprint-${suffix}`),
    });

    const login = await verifyPost(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ identifier: email, code: "123456", referralCode: referrerCode }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(login.status).toBe(200);
    const newSession = await getSession();
    expect(newSession?.userId).not.toBe(userId);
    replacementUserId = newSession?.userId ?? "";
    expect(await prisma.user.findUniqueOrThrow({ where: { id: replacementUserId } })).toMatchObject({
      email,
      isDisabled: false,
    });
    expect(await hasUsedTrial(replacementUserId)).toBe(true);

    const phoneSignup = await findOrCreateUser(phone, referrerCode);
    replacementPhoneUserId = phoneSignup.id;
    expect(phoneSignup).toMatchObject({ phone, referredById: null });
    expect(
      await prisma.coinTransaction.count({
        where: {
          type: "REFERRAL_BONUS",
          OR: [
            { userId: replacementUserId, refId: referrerId },
            { userId: referrerId, refId: replacementUserId },
            { userId: replacementPhoneUserId, refId: referrerId },
            { userId: referrerId, refId: replacementPhoneUserId },
          ],
        },
      }),
    ).toBe(0);
  });
});
