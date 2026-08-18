import { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";
import { discountedAmount, choosePlanPrice } from "./currency";
import { subscriptionProvider } from "./subscription-providers";

const day = 86_400_000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * day);
}

function addAnnual(date: Date) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  return result;
}

function statusEvent(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  fromStatus: SubscriptionStatus | null,
  toStatus: SubscriptionStatus,
  reason: string,
  actorType: "SYSTEM" | "ADMIN" | "USER",
  actorId?: string,
) {
  return tx.subscriptionEvent.create({
    data: { subscriptionId, fromStatus, toStatus, reason, actorType, actorId },
  });
}

async function activeForUser(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
}

async function priceWithDiscount(
  planId: string,
  priceId: string,
  discountCode: string | undefined,
  now: Date,
) {
  const price = await prisma.planPrice.findUniqueOrThrow({ where: { id: priceId } });
  if (!discountCode) return { price, discount: null };
  const discount = await prisma.discountCode.findUnique({
    where: { code: discountCode.toUpperCase() },
    include: { plans: true },
  });
  if (
    !discount ||
    !discount.isActive ||
    (discount.startsAt && discount.startsAt > now) ||
    (discount.endsAt && discount.endsAt < now) ||
    discount.redeemedCount >= discount.maxRedemptions ||
    (discount.plans.length > 0 && !discount.plans.some((item) => item.planId === planId))
  )
    throw new Error("INVALID_DISCOUNT");
  return {
    price,
    discount: {
      id: discount.id,
      type: discount.type,
      value: discount.value,
      trialAmountMinor: discountedAmount(price.trialAmountMinor, discount.type, discount.value),
      amountMinor: discountedAmount(price.amountMinor, discount.type, discount.value),
    },
  };
}

export async function getSubscriptionOffer(planCode: string, currency: string) {
  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
    include: { prices: { where: { isActive: true } } },
  });
  if (!plan || !plan.isActive) return null;
  const price = choosePlanPrice(plan, currency);
  return price ? { plan, price } : null;
}

export async function startTrial(
  userId: string,
  planCode: string,
  currency: string,
  country = "IN",
  discountCode?: string,
  now = new Date(),
) {
  const existing = await activeForUser(userId);
  if (existing) return existing;
  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
    include: { prices: { where: { isActive: true } } },
  });
  if (!plan || !plan.isActive) throw new Error("PLAN_NOT_FOUND");
  const price = choosePlanPrice(plan, currency);
  if (!price) throw new Error("PRICE_NOT_FOUND");
  const selected = await priceWithDiscount(plan.id, price.id, discountCode, now);
  const trialEndsAt = addDays(now, plan.trialDays);
  const subscriptionId = crypto.randomUUID();
  const provider = subscriptionProvider();
  const charge = await provider.createTrialCheckout({
    userId,
    subscriptionId,
    amountMinor: selected.discount?.trialAmountMinor ?? price.trialAmountMinor,
    currency: price.currency,
    trial: true,
  });
  try {
    return await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          id: subscriptionId,
          userId,
          planId: plan.id,
          priceId: price.id,
          status: "TRIALING",
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          provider: provider.name,
          providerRef: charge.providerRef,
          currency: price.currency,
          country,
        },
      });
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId,
          amountMinor: selected.discount?.trialAmountMinor ?? price.trialAmountMinor,
          currency: price.currency,
          kind: "TRIAL",
          status: "PAID",
          providerRef: charge.providerRef,
          periodKey: `trial-${trialEndsAt.toISOString()}`,
          paidAt: now,
        },
      });
      await statusEvent(tx, subscriptionId, null, "TRIALING", "Trial started", "SYSTEM");
      if (selected.discount) {
        await tx.discountCode.update({
          where: { id: selected.discount.id },
          data: { redeemedCount: { increment: 1 } },
        });
        await tx.subscriptionDiscountRedemption.create({
          data: {
            userId,
            subscriptionId,
            discountCodeId: selected.discount.id,
          },
        });
      }
      return subscription;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.subscription.findFirstOrThrow({
        where: { userId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        orderBy: { currentPeriodEnd: "desc" },
      });
    }
    throw error;
  }
}

async function sendTrialReminder(subscriptionId: string, now: Date, leadHours: number) {
  try {
    await prisma.notificationLog.create({
      data: {
        userId: (await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } }))
          .userId,
        message: `Your trial ends in ${leadHours} hours. Manage your subscription to keep watching.`,
        dryRun: true,
        subscriptionId,
        kind: "SUBSCRIPTION_TRIAL_END",
        sentAt: now,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return false;
    throw error;
  }
}

async function renewSubscription(subscriptionId: string, now: Date) {
  const claimed = await prisma.subscription.updateMany({
    where: {
      id: subscriptionId,
      OR: [
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "ACTIVE", currentPeriodEnd: { lte: now } },
      ],
      renewalStartedAt: null,
      cancelAtPeriodEnd: false,
    },
    data: { renewalStartedAt: now },
  });
  if (!claimed.count) return { converted: false, failed: false };
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { plan: true, price: true },
  });
  const periodBoundary =
    subscription.status === "TRIALING" ? subscription.trialEndsAt : subscription.currentPeriodEnd;
  const periodKey = `renewal-${periodBoundary.toISOString()}`;
  const provider = subscriptionProvider();
  try {
    const charge = await provider.chargeRenewal({
      userId: subscription.userId,
      subscriptionId,
      amountMinor: subscription.price.amountMinor,
      currency: subscription.currency,
      trial: false,
    });
    const nextEnd = addAnnual(now);
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.upsert({
        where: {
          subscriptionId_kind_periodKey: {
            subscriptionId,
            kind: "RENEWAL",
            periodKey,
          },
        },
        update: { status: "PAID", providerRef: charge.providerRef, paidAt: now },
        create: {
          subscriptionId,
          amountMinor: subscription.price.amountMinor,
          currency: subscription.currency,
          kind: "RENEWAL",
          status: "PAID",
          providerRef: charge.providerRef,
          periodKey,
          paidAt: now,
        },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: nextEnd,
          renewalStartedAt: null,
        },
      });
      await statusEvent(
        tx,
        subscriptionId,
        subscription.status,
        "ACTIVE",
        "Renewal paid",
        "SYSTEM",
      );
    });
    return { converted: true, failed: false };
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.upsert({
        where: {
          subscriptionId_kind_periodKey: {
            subscriptionId,
            kind: "RENEWAL",
            periodKey,
          },
        },
        update: { status: "FAILED" },
        create: {
          subscriptionId,
          amountMinor: subscription.price.amountMinor,
          currency: subscription.currency,
          kind: "RENEWAL",
          status: "FAILED",
          periodKey,
        },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: "PAST_DUE" },
      });
      await statusEvent(
        tx,
        subscriptionId,
        subscription.status,
        "PAST_DUE",
        "Renewal failed",
        "SYSTEM",
      );
    });
    return { converted: false, failed: true };
  }
}

export async function runSubscriptionCron(now = new Date()) {
  const settings = await prisma.subscriptionAutomation.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  let reminders = 0;
  if (settings.enabled) {
    const endingBy = addDays(now, settings.reminderLeadHours / 24);
    const trials = await prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { gt: now, lte: endingBy },
      },
      select: { id: true },
    });
    for (const trial of trials)
      if (await sendTrialReminder(trial.id, now, settings.reminderLeadHours)) reminders += 1;
  }
  const due = await prisma.subscription.findMany({
    where: {
      OR: [
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "ACTIVE", currentPeriodEnd: { lte: now } },
      ],
      cancelAtPeriodEnd: false,
    },
    select: { id: true },
  });
  let converted = 0;
  let failed = 0;
  const failedSubscriptionIds: string[] = [];
  for (const subscription of due) {
    const result = await renewSubscription(subscription.id, now);
    if (result.converted) converted += 1;
    if (result.failed) {
      failed += 1;
      failedSubscriptionIds.push(subscription.id);
    }
  }
  const expired = await prisma.subscription.findMany({
    where: {
      id: { notIn: failedSubscriptionIds },
      OR: [
        { status: { in: ["CANCELED", "PAST_DUE"] } },
        { cancelAtPeriodEnd: true, status: { in: ["TRIALING", "ACTIVE"] } },
      ],
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, status: true },
  });
  for (const subscription of expired) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.updateMany({
        where: { id: subscription.id, status: subscription.status },
        data: { status: "EXPIRED" },
      });
      if (updated.count)
        await statusEvent(
          tx,
          subscription.id,
          subscription.status,
          "EXPIRED",
          "Period ended",
          "SYSTEM",
        );
    });
  }
  return { reminders, converted, failed, expired: expired.length };
}

export async function cancelSubscription(
  userId: string,
  subscriptionId: string,
  actorType: "USER" | "ADMIN" = "USER",
  actorId = userId,
  immediate = false,
) {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
  });
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
  if (subscription.status === "EXPIRED") return subscription;
  const provider = subscriptionProvider();
  if (immediate && subscription.providerRef) await provider.cancel(subscription.providerRef);
  return prisma.$transaction(async (tx) => {
    const nextStatus = immediate ? "CANCELED" : subscription.status;
    const result = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: !immediate, status: nextStatus },
    });
    await statusEvent(
      tx,
      subscriptionId,
      subscription.status,
      nextStatus,
      immediate ? "Canceled by admin" : "Cancellation scheduled",
      actorType,
      actorId,
    );
    return result;
  });
}

export async function adminExtendSubscription(
  subscriptionId: string,
  actorId: string,
  extensionDays: number,
) {
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  });
  return prisma.$transaction(async (tx) => {
    const trialEndsAt =
      subscription.status === "TRIALING"
        ? addDays(subscription.trialEndsAt, extensionDays)
        : subscription.trialEndsAt;
    const currentPeriodEnd = addDays(subscription.currentPeriodEnd, extensionDays);
    const result = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { trialEndsAt, currentPeriodEnd },
    });
    await statusEvent(
      tx,
      subscriptionId,
      subscription.status,
      subscription.status,
      `Admin extended by ${extensionDays} days`,
      "ADMIN",
      actorId,
    );
    return result;
  });
}

export async function getUserSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      plan: true,
      price: true,
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function processSubscriptionWebhook(
  providerName: "DEV" | "STRIPE",
  webhook: {
    eventId: string;
    type: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "SUBSCRIPTION_CANCELED";
    providerRef: string;
  },
  payload: unknown,
) {
  const provider = providerName;
  try {
    const recorded = await prisma.subscriptionWebhookEvent.create({
      data: {
        provider,
        providerEventId: webhook.eventId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    const subscription = await prisma.subscription.findFirst({
      where: { providerRef: webhook.providerRef },
    });
    if (!subscription) return { duplicate: false, handled: false };
    await prisma.$transaction(async (tx) => {
      const toStatus =
        webhook.type === "PAYMENT_SUCCEEDED"
          ? "ACTIVE"
          : webhook.type === "PAYMENT_FAILED"
            ? "PAST_DUE"
            : "CANCELED";
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: toStatus, renewalStartedAt: null },
      });
      await statusEvent(
        tx,
        subscription.id,
        subscription.status,
        toStatus,
        `Webhook ${webhook.type}`,
        "SYSTEM",
      );
      await tx.subscriptionWebhookEvent.update({
        where: { id: recorded.id },
        data: { subscriptionId: subscription.id },
      });
    });
    return { duplicate: false, handled: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { duplicate: true, handled: false };
    throw error;
  }
}
