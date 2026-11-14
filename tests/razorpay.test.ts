import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret";
  process.env.PAYMENTS_ENABLED = "true";
});

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || undefined,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || undefined,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || undefined,
    PAYMENTS_ENABLED: process.env.PAYMENTS_ENABLED === "true",
  }),
}));

import { prisma } from "../src/server/db";
import {
  confirmRazorpayCheckout,
  createRazorpayCheckout,
  processRazorpayWebhook,
  verifyRazorpayWebhook,
} from "../src/server/razorpay";
import { cancelSubscription } from "../src/server/subscriptions";
import {
  anonymizedTrialClaimDeviceFingerprint,
  anonymizedTrialClaimEmail,
} from "../src/server/trial-claim-privacy";

const suffix = crypto.randomUUID().slice(0, 8);
const planCode = `RZP_MONTHLY_${suffix}`;
const calls: { path: string; body: Record<string, unknown> }[] = [];
const userIds: string[] = [];
const anonymizedClaimIds: string[] = [];
let planId = "";
let counter = 0;

function sign(paymentId: string, subscriptionId: string) {
  return createHmac("sha256", "rzp_test_secret")
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
}

async function createUser(prefix: string, email = `${prefix}-${suffix}@test.local`) {
  const user = await prisma.user.create({
    data: {
      email,
      referralCode: `RZ${prefix.toUpperCase()}${suffix}`,
    },
  });
  userIds.push(user.id);
  return user;
}

async function createDeletedTrialClaim(email: string, fingerprint?: string) {
  const user = await createUser(`deleted-source-${userIds.length}`, email);
  const claim = await prisma.trialClaim.create({
    data: { userId: user.id, email, deviceFingerprint: fingerprint },
  });
  anonymizedClaimIds.push(claim.id);
  await prisma.$transaction(async (tx) => {
    await tx.trialClaim.update({
      where: { id: claim.id },
      data: {
        userId: null,
        email: anonymizedTrialClaimEmail(email),
        deviceFingerprint: fingerprint
          ? anonymizedTrialClaimDeviceFingerprint(fingerprint)
          : null,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { email: null, phone: null, name: null, passwordHash: null, isDisabled: true },
    });
  });
}

describe("razorpay subscriptions", () => {
  beforeAll(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const path = url.replace("https://api.razorpay.com/v1", "");
        calls.push({ path, body: JSON.parse(String(init.body)) });
        counter += 1;
        const id = path === "/plans" ? `plan_${suffix}` : `sub_${suffix}_${counter}`;
        return new Response(JSON.stringify({ id }), { status: 200 });
      }),
    );
    const plan = await prisma.plan.create({
      data: {
        code: planCode,
        name: "VIP Monthly Test",
        interval: "MONTHLY",
        trialDays: 4,
        prices: {
          create: [
            { currency: "INR", amountMinor: 8_900, trialAmountMinor: 900, countryCodes: [] },
          ],
        },
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.trialClaim.deleteMany({ where: { id: { in: anonymizedClaimIds } } });
    await prisma.trialClaim.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.providerPlan.deleteMany({ where: { ref: `plan_${suffix}` } });
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.PAYMENTS_ENABLED;
  });

  it("starts a trial checkout, confirms it and renews from webhooks", async () => {
    const user = await createUser("trial");
    const now = new Date("2026-11-14T10:00:00Z");
    const checkout = await createRazorpayCheckout(
      user.id,
      planCode,
      "TRIAL",
      "device-trial-1",
      now,
    );
    const planCall = calls.find((call) => call.path === "/plans");
    expect(planCall?.body).toMatchObject({
      period: "monthly",
      interval: 1,
      item: { amount: 8_900, currency: "INR" },
    });
    const subCall = calls.find((call) => call.path === "/subscriptions");
    expect(subCall?.body).toMatchObject({
      plan_id: `plan_${suffix}`,
      start_at: Math.floor(new Date("2026-11-18T10:00:00Z").getTime() / 1_000),
      addons: [{ item: { amount: 900, currency: "INR" } }],
    });
    const pending = await prisma.subscription.findUniqueOrThrow({
      where: { id: checkout.subscriptionId },
    });
    expect(pending.status).toBe("INCOMPLETE");

    await expect(
      confirmRazorpayCheckout(user.id, {
        razorpayPaymentId: "pay_trial",
        razorpaySubscriptionId: checkout.razorpaySubscriptionId,
        razorpaySignature: "bad",
      }),
    ).rejects.toThrow("INVALID_PAYMENT_SIGNATURE");

    const confirmed = await confirmRazorpayCheckout(user.id, {
      razorpayPaymentId: "pay_trial",
      razorpaySubscriptionId: checkout.razorpaySubscriptionId,
      razorpaySignature: sign("pay_trial", checkout.razorpaySubscriptionId),
      deviceFingerprint: "device-trial-1",
    });
    expect(confirmed.status).toBe("TRIALING");
    expect(await prisma.trialClaim.count({ where: { userId: user.id } })).toBe(1);
    await expect(
      createRazorpayCheckout(user.id, planCode, "TRIAL", "device-trial-1", now),
    ).rejects.toThrow("TRIAL_ALREADY_USED");

    const charged = {
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: checkout.razorpaySubscriptionId,
            current_start: Date.parse("2026-11-18T10:00:00Z") / 1_000,
            current_end: Date.parse("2026-12-18T10:00:00Z") / 1_000,
          },
        },
        payment: { entity: { id: "pay_renew_1", amount: 8_900 } },
      },
    };
    const body = JSON.stringify(charged);
    await expect(verifyRazorpayWebhook(body, "wrong")).rejects.toThrow(
      "INVALID_WEBHOOK_SIGNATURE",
    );
    const event = await verifyRazorpayWebhook(
      body,
      createHmac("sha256", "rzp_webhook_secret").update(body).digest("hex"),
    );
    expect(await processRazorpayWebhook(`evt_charged_${suffix}`, event)).toMatchObject({
      handled: true,
    });
    expect(await processRazorpayWebhook(`evt_charged_${suffix}`, event)).toMatchObject({
      duplicate: true,
    });
    const active = await prisma.subscription.findUniqueOrThrow({
      where: { id: checkout.subscriptionId },
      include: { invoices: true },
    });
    expect(active.status).toBe("ACTIVE");
    expect(active.currentPeriodEnd.toISOString()).toBe("2026-12-18T10:00:00.000Z");
    expect(active.invoices.filter((invoice) => invoice.status === "PAID")).toHaveLength(2);

    await processRazorpayWebhook(`evt_halted_${suffix}`, {
      event: "subscription.halted",
      payload: { subscription: { entity: { id: checkout.razorpaySubscriptionId } } },
    });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: checkout.subscriptionId } }))
        .status,
    ).toBe("PAST_DUE");
  });

  it("does not let a new account reclaim a deleted user's trial by email", async () => {
    const email = `reclaimed-email-${suffix}@test.local`;
    await createDeletedTrialClaim(email);
    const replacement = await createUser("replacement-email", email);

    await expect(createRazorpayCheckout(replacement.id, planCode, "TRIAL")).rejects.toThrow(
      "TRIAL_ALREADY_USED",
    );
  });

  it("does not let a new account reclaim a deleted user's trial by device fingerprint", async () => {
    const fingerprint = `reclaimed-device-${suffix}`;
    await createDeletedTrialClaim(`deleted-device-${suffix}@test.local`, fingerprint);
    const replacement = await createUser("replacement-device");

    await expect(
      createRazorpayCheckout(replacement.id, planCode, "TRIAL", fingerprint),
    ).rejects.toThrow("TRIAL_ALREADY_USED");
  });

  it("activates a paid plan once and cancels it at cycle end on Razorpay", async () => {
    const user = await createUser("paid");
    const checkout = await createRazorpayCheckout(user.id, planCode, "PAID");
    expect(calls.filter((call) => call.path === "/plans")).toHaveLength(1);
    expect(calls.at(-1)?.body).not.toHaveProperty("start_at");
    await processRazorpayWebhook(`evt_first_${suffix}`, {
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: checkout.razorpaySubscriptionId } },
        payment: { entity: { id: "pay_first", amount: 8_900 } },
      },
    });
    const confirmed = await confirmRazorpayCheckout(user.id, {
      razorpayPaymentId: "pay_first",
      razorpaySubscriptionId: checkout.razorpaySubscriptionId,
      razorpaySignature: sign("pay_first", checkout.razorpaySubscriptionId),
    });
    expect(confirmed.status).toBe("ACTIVE");
    expect(
      await prisma.subscriptionInvoice.count({
        where: { subscriptionId: checkout.subscriptionId, status: "PAID" },
      }),
    ).toBe(1);

    await cancelSubscription(user.id, checkout.subscriptionId);
    expect(calls.at(-1)).toEqual({
      path: `/subscriptions/${checkout.razorpaySubscriptionId}/cancel`,
      body: { cancel_at_cycle_end: 1 },
    });
  });
  it("replaces unpaid checkouts, keeps access after cancel and recovers late payments", async () => {
    const user = await createUser("recover");
    const first = await createRazorpayCheckout(user.id, planCode, "PAID");
    const second = await createRazorpayCheckout(user.id, planCode, "PAID");
    expect(calls).toContainEqual({
      path: `/subscriptions/${first.razorpaySubscriptionId}/cancel`,
      body: { cancel_at_cycle_end: 0 },
    });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: first.subscriptionId } })).status,
    ).toBe("EXPIRED");
    await confirmRazorpayCheckout(user.id, {
      razorpayPaymentId: "pay_recover_1",
      razorpaySubscriptionId: second.razorpaySubscriptionId,
      razorpaySignature: sign("pay_recover_1", second.razorpaySubscriptionId),
    });
    await cancelSubscription(user.id, second.subscriptionId);
    await processRazorpayWebhook(`evt_cancelled_${suffix}`, {
      event: "subscription.cancelled",
      payload: { subscription: { entity: { id: second.razorpaySubscriptionId } } },
    });
    const cancelled = await prisma.subscription.findUniqueOrThrow({
      where: { id: second.subscriptionId },
    });
    expect(cancelled.status).toBe("ACTIVE");
    expect(cancelled.cancelAtPeriodEnd).toBe(true);

    await prisma.subscription.update({
      where: { id: second.subscriptionId },
      data: { status: "EXPIRED" },
    });
    const late = {
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: second.razorpaySubscriptionId } },
        payment: { entity: { id: "pay_recover_2", amount: 8_900 } },
      },
    };
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = (() => Promise.reject(new Error("DB_DOWN"))) as never;
    try {
      await expect(processRazorpayWebhook(`evt_late_${suffix}`, late)).rejects.toThrow("DB_DOWN");
    } finally {
      prisma.$transaction = originalTransaction;
    }
    expect(await processRazorpayWebhook(`evt_late_${suffix}`, late)).toMatchObject({
      handled: true,
    });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: second.subscriptionId } }))
        .status,
    ).toBe("ACTIVE");
  });
});
