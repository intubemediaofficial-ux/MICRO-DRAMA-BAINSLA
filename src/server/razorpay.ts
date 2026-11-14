import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, SubscriptionInterval } from "@prisma/client";
import { env } from "./config";
import { prisma } from "./db";
import { addInterval, findPlan, statusEvent } from "./subscriptions";

const API = "https://api.razorpay.com/v1";

const PERIOD: Record<SubscriptionInterval, { period: "monthly" | "yearly"; interval: number }> = {
  MONTHLY: { period: "monthly", interval: 1 },
  HALF_YEARLY: { period: "monthly", interval: 6 },
  ANNUAL: { period: "yearly", interval: 1 },
};

/** Number of billing cycles Razorpay will charge (about 10 years). */
const TOTAL_COUNT: Record<SubscriptionInterval, number> = {
  MONTHLY: 120,
  HALF_YEARLY: 20,
  ANNUAL: 10,
};

export function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

async function razorpay<T>(path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error("RAZORPAY_REQUEST_FAILED");
  return (await response.json()) as T;
}

function hmac(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqual(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function providerPlanRef(
  interval: SubscriptionInterval,
  currency: string,
  amountMinor: number,
  name: string,
) {
  const key = `${interval}:${currency}:${amountMinor}`;
  const existing = await prisma.providerPlan.findUnique({
    where: { provider_key: { provider: "RAZORPAY", key } },
  });
  if (existing) return existing.ref;
  const created = await razorpay<{ id: string }>("/plans", {
    ...PERIOD[interval],
    item: { name, amount: amountMinor, currency },
  });
  try {
    await prisma.providerPlan.create({ data: { provider: "RAZORPAY", key, ref: created.id } });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return (
        await prisma.providerPlan.findUniqueOrThrow({
          where: { provider_key: { provider: "RAZORPAY", key } },
        })
      ).ref;
    throw error;
  }
}

export type RazorpayCheckout = {
  provider: "RAZORPAY";
  keyId: string;
  razorpaySubscriptionId: string;
  subscriptionId: string;
  description: string;
  prefill: { email?: string; contact?: string; name?: string };
};

export async function createRazorpayCheckout(
  userId: string,
  planCode: string,
  mode: "TRIAL" | "PAID",
  deviceFingerprint?: string,
  now = new Date(),
): Promise<RazorpayCheckout> {
  const plan = await findPlan(planCode);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const price = plan.prices.find((item) => item.currency === "INR");
  if (!price) throw new Error("PRICE_NOT_FOUND");
  if (mode === "TRIAL" && plan.trialDays < 1) throw new Error("TRIAL_NOT_AVAILABLE");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, phone: true, name: true },
  });
  const email = user.email?.trim().toLowerCase();
  if (mode === "TRIAL") {
    if (!email) throw new Error("TRIAL_EMAIL_REQUIRED");
    const fingerprint = deviceFingerprint?.trim() || undefined;
    const prior = await prisma.trialClaim.findFirst({
      where: { OR: [{ email }, ...(fingerprint ? [{ deviceFingerprint: fingerprint }] : [])] },
    });
    if (prior) throw new Error("TRIAL_ALREADY_USED");
  }
  const existing = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
  });
  if (existing) throw new Error("SUBSCRIPTION_EXISTS");

  const trial = mode === "TRIAL";
  const trialEndsAt = trial ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1_000) : now;
  const periodEnd = trial ? trialEndsAt : addInterval(now, plan.interval);
  const planRef = await providerPlanRef(plan.interval, "INR", price.amountMinor, plan.name);
  const subscriptionId = crypto.randomUUID();
  const remote = await razorpay<{ id: string }>("/subscriptions", {
    plan_id: planRef,
    total_count: TOTAL_COUNT[plan.interval],
    customer_notify: 1,
    notes: { subscription_id: subscriptionId, user_id: userId, mode },
    ...(trial
      ? {
          start_at: Math.floor(trialEndsAt.getTime() / 1_000),
          addons: [
            {
              item: {
                name: `${plan.trialDays}-day trial`,
                amount: price.trialAmountMinor,
                currency: "INR",
              },
            },
          ],
        }
      : {}),
  });
  await prisma.$transaction(async (tx) => {
    await tx.subscription.create({
      data: {
        id: subscriptionId,
        userId,
        planId: plan.id,
        priceId: price.id,
        status: "INCOMPLETE",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        provider: "RAZORPAY",
        providerRef: remote.id,
        currency: "INR",
        country: "IN",
      },
    });
    await tx.subscriptionInvoice.create({
      data: {
        subscriptionId,
        amountMinor: trial ? price.trialAmountMinor : price.amountMinor,
        currency: "INR",
        kind: trial ? "TRIAL" : "RENEWAL",
        status: "PENDING",
        periodKey: trial ? `trial-${trialEndsAt.toISOString()}` : `first-${now.toISOString()}`,
      },
    });
    await statusEvent(tx, subscriptionId, null, "INCOMPLETE", "Checkout started", "USER", userId);
  });
  return {
    provider: "RAZORPAY",
    keyId: env.RAZORPAY_KEY_ID!,
    razorpaySubscriptionId: remote.id,
    subscriptionId,
    description: trial ? `${plan.trialDays}-day trial, then ${plan.name}` : plan.name,
    prefill: {
      ...(email ? { email } : {}),
      ...(user.phone ? { contact: user.phone } : {}),
      ...(user.name ? { name: user.name } : {}),
    },
  };
}

/** Activates an INCOMPLETE subscription once its first payment is confirmed. Idempotent. */
async function activate(
  razorpaySubscriptionId: string,
  paymentId: string,
  deviceFingerprint?: string,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({
      where: { providerRef: razorpaySubscriptionId },
      include: { invoices: true, plan: true, user: { select: { email: true } } },
    });
    if (!current || current.provider !== "RAZORPAY") throw new Error("SUBSCRIPTION_NOT_FOUND");
    const fingerprint = deviceFingerprint?.trim() || undefined;
    if (current.status !== "INCOMPLETE") {
      if (
        fingerprint &&
        !(await tx.trialClaim.findFirst({ where: { deviceFingerprint: fingerprint } }))
      )
        await tx.trialClaim.updateMany({
          where: { userId: current.userId, deviceFingerprint: null },
          data: { deviceFingerprint: fingerprint },
        });
      return current;
    }
    const invoice = current.invoices.find((item) => item.status === "PENDING");
    const trial = invoice?.kind === "TRIAL";
    const now = new Date();
    const status = trial ? "TRIALING" : "ACTIVE";
    if (invoice)
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", providerRef: paymentId, paidAt: now },
      });
    const updated = await tx.subscription.update({
      where: { id: current.id },
      data: trial
        ? { status }
        : {
            status,
            currentPeriodStart: now,
            currentPeriodEnd: addInterval(now, current.plan.interval),
          },
    });
    if (trial && current.user.email) {
      const email = current.user.email.trim().toLowerCase();
      const claimed = await tx.trialClaim.findFirst({
        where: { OR: [{ email }, ...(fingerprint ? [{ deviceFingerprint: fingerprint }] : [])] },
      });
      if (!claimed)
        await tx.trialClaim.create({
          data: { userId: current.userId, email, deviceFingerprint: fingerprint },
        });
    }
    await statusEvent(tx, current.id, "INCOMPLETE", status, "Razorpay payment confirmed", "SYSTEM");
    return updated;
  });
}

export async function confirmRazorpayCheckout(
  userId: string,
  input: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    razorpaySignature: string;
    deviceFingerprint?: string;
  },
) {
  if (!env.RAZORPAY_KEY_SECRET) throw new Error("PAYMENTS_UNAVAILABLE");
  const expected = hmac(
    env.RAZORPAY_KEY_SECRET,
    `${input.razorpayPaymentId}|${input.razorpaySubscriptionId}`,
  );
  if (!safeEqual(expected, input.razorpaySignature)) throw new Error("INVALID_PAYMENT_SIGNATURE");
  const owned = await prisma.subscription.findFirst({
    where: { providerRef: input.razorpaySubscriptionId, userId },
    select: { id: true },
  });
  if (!owned) throw new Error("SUBSCRIPTION_NOT_FOUND");
  return activate(input.razorpaySubscriptionId, input.razorpayPaymentId, input.deviceFingerprint);
}

type RazorpayEvent = {
  event?: string;
  payload?: {
    subscription?: {
      entity?: { id?: string; current_start?: number | null; current_end?: number | null };
    };
    payment?: { entity?: { id?: string; amount?: number } };
  };
};

export function verifyRazorpayWebhook(payload: string, signature: string | null) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) throw new Error("INVALID_WEBHOOK_SIGNATURE");
  if (!safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, payload), signature))
    throw new Error("INVALID_WEBHOOK_SIGNATURE");
  return JSON.parse(payload) as RazorpayEvent;
}

function fromUnix(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1_000) : null;
}

export async function processRazorpayWebhook(eventId: string, event: RazorpayEvent) {
  const remote = event.payload?.subscription?.entity;
  if (!remote?.id) return { duplicate: false, handled: false };
  const local = await prisma.subscription.findUnique({ where: { providerRef: remote.id } });
  try {
    await prisma.subscriptionWebhookEvent.create({
      data: {
        provider: "RAZORPAY",
        providerEventId: eventId,
        subscriptionId: local?.id,
        payload: event as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { duplicate: true, handled: false };
    throw error;
  }
  if (!local) return { duplicate: false, handled: false };
  const payment = event.payload?.payment?.entity;

  if (event.event === "subscription.authenticated" || event.event === "subscription.activated") {
    if (local.status === "INCOMPLETE")
      await activate(remote.id, payment?.id ?? `${event.event}:${remote.id}`);
    return { duplicate: false, handled: true };
  }
  if (event.event === "subscription.charged") {
    if (!payment?.id) return { duplicate: false, handled: false };
    if (local.status === "INCOMPLETE") {
      await activate(remote.id, payment.id);
      return { duplicate: false, handled: true };
    }
    await prisma.$transaction(async (tx) => {
      const seen = await tx.subscriptionInvoice.findFirst({
        where: { subscriptionId: local.id, providerRef: payment.id },
      });
      if (seen) return;
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: local.planId } });
      const start = fromUnix(remote.current_start) ?? new Date();
      const end = fromUnix(remote.current_end) ?? addInterval(start, plan.interval);
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: local.id,
          amountMinor: payment.amount ?? 0,
          currency: "INR",
          kind: "RENEWAL",
          status: "PAID",
          providerRef: payment.id,
          periodKey: `renewal-${start.toISOString()}`,
          paidAt: new Date(),
        },
      });
      const status = local.status === "CANCELED" ? "CANCELED" : "ACTIVE";
      await tx.subscription.update({
        where: { id: local.id },
        data: {
          status,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          pastDueSince: null,
          renewalStartedAt: null,
        },
      });
      await statusEvent(tx, local.id, local.status, status, "Razorpay renewal charged", "SYSTEM");
    });
    return { duplicate: false, handled: true };
  }
  if (event.event === "subscription.pending" || event.event === "subscription.halted") {
    if (!["TRIALING", "ACTIVE"].includes(local.status)) return { duplicate: false, handled: false };
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: local.id },
        data: { status: "PAST_DUE", pastDueSince: local.pastDueSince ?? new Date() },
      });
      await statusEvent(
        tx,
        local.id,
        local.status,
        "PAST_DUE",
        `Razorpay ${event.event}`,
        "SYSTEM",
      );
    });
    return { duplicate: false, handled: true };
  }
  if (event.event === "subscription.cancelled" || event.event === "subscription.completed") {
    if (local.status === "EXPIRED" || local.status === "CANCELED")
      return { duplicate: false, handled: false };
    // Keep access until the paid period ends; the cron expires it via cancelAtPeriodEnd.
    const status = local.status === "INCOMPLETE" ? "EXPIRED" : local.status;
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: local.id },
        data: { status, cancelAtPeriodEnd: true, renewalStartedAt: null },
      });
      await statusEvent(tx, local.id, local.status, status, `Razorpay ${event.event}`, "SYSTEM");
    });
    return { duplicate: false, handled: true };
  }
  return { duplicate: false, handled: false };
}

export async function cancelRazorpaySubscription(providerRef: string, atCycleEnd: boolean) {
  await razorpay(`/subscriptions/${providerRef}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}
