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

function nextAnnualBoundary(periodBoundary: Date, now: Date) {
  let next = addAnnual(periodBoundary);
  while (next <= now) next = addAnnual(next);
  return next;
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

export async function hasUsedTrial(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return false;
  return Boolean(
    await prisma.trialClaim.findUnique({
      where: { email: user.email.trim().toLowerCase() },
      select: { id: true },
    }),
  );
}

type PurchaseMode = "TRIAL" | "ANNUAL";

async function startSubscription(
  userId: string,
  planCode: string,
  currency: string,
  country: string,
  mode: PurchaseMode,
  discountCode: string | undefined,
  deviceFingerprint: string | undefined,
  now: Date,
) {
  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
    include: { prices: { where: { isActive: true } } },
  });
  if (!plan || !plan.isActive) throw new Error("PLAN_NOT_FOUND");
  const price = choosePlanPrice(plan, currency);
  if (!price) throw new Error("PRICE_NOT_FOUND");
  const selected = await priceWithDiscount(plan.id, price.id, discountCode, now);
  const trialEndsAt = mode === "TRIAL" ? addDays(now, plan.trialDays) : now;
  const currentPeriodEnd = mode === "TRIAL" ? trialEndsAt : addAnnual(now);
  const status = mode === "TRIAL" ? "TRIALING" : "ACTIVE";
  const invoiceKind = mode === "TRIAL" ? "TRIAL" : "RENEWAL";
  const periodKey =
    mode === "TRIAL" ? `trial-${trialEndsAt.toISOString()}` : `annual-${now.toISOString()}`;
  const subscriptionId = crypto.randomUUID();
  const provider = subscriptionProvider();
  const amountMinor =
    mode === "TRIAL"
      ? (selected.discount?.trialAmountMinor ?? price.trialAmountMinor)
      : (selected.discount?.amountMinor ?? price.amountMinor);
  const emailUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!emailUser?.email) throw new Error("TRIAL_EMAIL_REQUIRED");
  const email = emailUser.email.trim().toLowerCase();
  const normalizedDeviceFingerprint = deviceFingerprint?.trim() || undefined;

  let claimed:
    | { existing: NonNullable<Awaited<ReturnType<typeof activeForUser>>> }
    | { subscription: { id: string } };
  try {
    claimed = await prisma.$transaction(async (tx) => {
      if (mode === "TRIAL") {
        const priorClaim = await tx.trialClaim.findFirst({
          where: {
            OR: [
              { email },
              ...(normalizedDeviceFingerprint
                ? [{ deviceFingerprint: normalizedDeviceFingerprint }]
                : []),
            ],
          },
        });
        if (priorClaim) throw new Error("TRIAL_ALREADY_USED");
      }
      const existing = await tx.subscription.findFirst({
        where: { userId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        orderBy: { currentPeriodEnd: "desc" },
      });
      if (existing) return { existing };
      const subscription = await tx.subscription.create({
        data: {
          id: subscriptionId,
          userId,
          planId: plan.id,
          priceId: price.id,
          status,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd,
          provider: provider.name,
          providerRef: null,
          currency: price.currency,
          country,
        },
      });
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId,
          amountMinor,
          currency: price.currency,
          kind: invoiceKind,
          status: "PENDING",
          periodKey,
        },
      });
      if (mode === "TRIAL")
        await tx.trialClaim.create({
          data: { userId, email, deviceFingerprint: normalizedDeviceFingerprint },
        });
      await statusEvent(
        tx,
        subscriptionId,
        null,
        status,
        mode === "TRIAL" ? "Trial started" : "Annual subscription started",
        "SYSTEM",
      );
      return { subscription };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (mode === "TRIAL") {
        const [priorClaim, existing] = await Promise.all([
          prisma.trialClaim.findFirst({
            where: {
              OR: [
                { email },
                ...(normalizedDeviceFingerprint
                  ? [{ deviceFingerprint: normalizedDeviceFingerprint }]
                  : []),
              ],
            },
            select: { id: true },
          }),
          activeForUser(userId),
        ]);
        if (priorClaim) throw new Error("TRIAL_ALREADY_USED");
        if (existing) throw new Error("SUBSCRIPTION_EXISTS");
      }
      const existing = await activeForUser(userId);
      if (existing) return existing;
    }
    throw error;
  }
  if ("existing" in claimed) {
    if (mode === "TRIAL") throw new Error("SUBSCRIPTION_EXISTS");
    return claimed.existing;
  }

  let charge;
  try {
    charge =
      mode === "TRIAL"
        ? await provider.createTrialCheckout({
            userId,
            subscriptionId,
            amountMinor,
            currency: price.currency,
            trial: true,
            periodKey,
          })
        : await provider.chargeRenewal({
            userId,
            subscriptionId,
            amountMinor,
            currency: price.currency,
            trial: false,
            periodKey,
          });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.update({
        where: {
          subscriptionId_kind_periodKey: {
            subscriptionId,
            kind: invoiceKind,
            periodKey,
          },
        },
        data: { status: "FAILED" },
      });
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: "EXPIRED", renewalStartedAt: null },
      });
      await statusEvent(
        tx,
        subscriptionId,
        status,
        "EXPIRED",
        mode === "TRIAL" ? "Trial charge failed" : "Annual charge failed",
        "SYSTEM",
      );
    });
    throw error;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { providerRef: charge.providerRef, status },
      });
      await tx.subscriptionInvoice.update({
        where: {
          subscriptionId_kind_periodKey: {
            subscriptionId,
            kind: invoiceKind,
            periodKey,
          },
        },
        data: { status: "PAID", providerRef: charge.providerRef, paidAt: now },
      });
      await statusEvent(
        tx,
        subscriptionId,
        status,
        status,
        mode === "TRIAL" ? "Trial charge paid" : "Annual subscription paid",
        "SYSTEM",
      );
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
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { providerRef: charge.providerRef },
        });
        await tx.subscriptionInvoice.update({
          where: {
            subscriptionId_kind_periodKey: {
              subscriptionId,
              kind: invoiceKind,
              periodKey,
            },
          },
          data: { status: "PAID", providerRef: charge.providerRef, paidAt: now },
        });
        await statusEvent(
          tx,
          subscriptionId,
          status,
          status,
          mode === "TRIAL"
            ? "Trial charge paid; reconciliation required"
            : "Annual charge paid; reconciliation required",
          "SYSTEM",
        );
      });
    } catch {
      throw new Error(`${mode}_CHARGE_RECONCILIATION_FAILED`);
    }
    throw error;
  }
}

export async function startTrial(
  userId: string,
  planCode: string,
  currency: string,
  country = "IN",
  discountCode?: string,
  now = new Date(),
  deviceFingerprint?: string,
) {
  return startSubscription(
    userId,
    planCode,
    currency,
    country,
    "TRIAL",
    discountCode,
    deviceFingerprint,
    now,
  );
}

export async function purchaseAnnual(
  userId: string,
  planCode: string,
  currency: string,
  country = "IN",
  discountCode?: string,
  now = new Date(),
) {
  return startSubscription(
    userId,
    planCode,
    currency,
    country,
    "ANNUAL",
    discountCode,
    undefined,
    now,
  );
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

async function renewSubscription(subscriptionId: string, now: Date, gracePeriodHours: number) {
  const graceSince = new Date(now.getTime() - gracePeriodHours * 60 * 60 * 1_000);
  const claimed = await prisma.subscription.updateMany({
    where: {
      id: subscriptionId,
      OR: [
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "ACTIVE", currentPeriodEnd: { lte: now } },
        { status: "PAST_DUE", pastDueSince: { gt: graceSince, lte: now } },
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
      periodKey,
    });
    const nextEnd = nextAnnualBoundary(periodBoundary, now);
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
          currentPeriodStart: periodBoundary,
          currentPeriodEnd: nextEnd,
          providerRef: charge.providerRef,
          renewalStartedAt: null,
          pastDueSince: null,
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
        data: {
          status: "PAST_DUE",
          renewalStartedAt: null,
          pastDueSince: subscription.pastDueSince ?? now,
        },
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
        {
          status: "PAST_DUE",
          pastDueSince: {
            gt: new Date(now.getTime() - settings.gracePeriodHours * 60 * 60 * 1_000),
            lte: now,
          },
        },
      ],
      cancelAtPeriodEnd: false,
    },
    select: { id: true },
  });
  let converted = 0;
  let failed = 0;
  const failedSubscriptionIds: string[] = [];
  for (const subscription of due) {
    const result = await renewSubscription(subscription.id, now, settings.gracePeriodHours);
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
        {
          status: "PAST_DUE",
          pastDueSince: {
            lte: new Date(now.getTime() - settings.gracePeriodHours * 60 * 60 * 1_000),
          },
        },
        {
          status: "PAST_DUE",
          pastDueSince: null,
          currentPeriodEnd: { lt: now },
        },
        { status: "CANCELED", currentPeriodEnd: { lt: now } },
        {
          cancelAtPeriodEnd: true,
          status: { in: ["TRIALING", "ACTIVE"] },
          currentPeriodEnd: { lt: now },
        },
      ],
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
      where: {
        OR: [
          { providerRef: webhook.providerRef },
          { invoices: { some: { providerRef: webhook.providerRef } } },
        ],
      },
      include: { invoices: true },
    });
    if (!subscription) return { duplicate: false, handled: false };
    return prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { invoices: true },
      });
      const matchedInvoice = current.invoices.find(
        (invoice) => invoice.providerRef === webhook.providerRef,
      );
      const terminal = current.status === "CANCELED" || current.status === "EXPIRED";
      const ignored = async (reason: string) => {
        await statusEvent(tx, current.id, current.status, current.status, reason, "SYSTEM");
        await tx.subscriptionWebhookEvent.update({
          where: { id: recorded.id },
          data: { subscriptionId: current.id },
        });
        return { duplicate: false, handled: false, ignored: true };
      };
      if (terminal) return ignored(`Ignored illegal webhook transition: ${webhook.type}`);

      const now = new Date();
      if (webhook.type === "SUBSCRIPTION_CANCELED") {
        if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(current.status))
          return ignored(`Ignored illegal webhook transition: ${webhook.type}`);
        await tx.subscription.update({
          where: { id: current.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: true, renewalStartedAt: null },
        });
        await statusEvent(
          tx,
          current.id,
          current.status,
          "CANCELED",
          `Webhook ${webhook.type}`,
          "SYSTEM",
        );
      } else {
        const isTrialPayment =
          current.status === "TRIALING" &&
          current.trialEndsAt > now &&
          !matchedInvoice?.periodKey.startsWith("renewal-");
        const periodBoundary =
          current.status === "TRIALING" ? current.trialEndsAt : current.currentPeriodEnd;
        const periodKey =
          matchedInvoice?.periodKey ??
          (isTrialPayment
            ? `trial-${current.trialEndsAt.toISOString()}`
            : `renewal-${periodBoundary.toISOString()}`);
        if (webhook.type === "PAYMENT_SUCCEEDED") {
          if (matchedInvoice?.status === "PAID")
            return ignored("Ignored duplicate payment success for settled invoice");
          await tx.subscriptionInvoice.upsert({
            where: {
              subscriptionId_kind_periodKey: {
                subscriptionId: current.id,
                kind: isTrialPayment ? "TRIAL" : "RENEWAL",
                periodKey,
              },
            },
            update: {
              status: "PAID",
              providerRef: webhook.providerRef,
              paidAt: now,
            },
            create: {
              subscriptionId: current.id,
              amountMinor: current.priceId
                ? (await tx.planPrice.findUniqueOrThrow({ where: { id: current.priceId } }))
                    .amountMinor
                : 0,
              currency: current.currency,
              kind: isTrialPayment ? "TRIAL" : "RENEWAL",
              status: "PAID",
              providerRef: webhook.providerRef,
              periodKey,
              paidAt: now,
            },
          });
          if (!isTrialPayment) {
            await tx.subscription.update({
              where: { id: current.id },
              data: {
                status: "ACTIVE",
                currentPeriodStart: periodBoundary,
                currentPeriodEnd: nextAnnualBoundary(periodBoundary, now),
                providerRef: webhook.providerRef,
                renewalStartedAt: null,
                pastDueSince: null,
              },
            });
            await statusEvent(
              tx,
              current.id,
              current.status,
              "ACTIVE",
              `Webhook ${webhook.type}`,
              "SYSTEM",
            );
          } else {
            await tx.subscription.update({
              where: { id: current.id },
              data: { providerRef: webhook.providerRef },
            });
            await statusEvent(
              tx,
              current.id,
              current.status,
              current.status,
              `Webhook ${webhook.type}`,
              "SYSTEM",
            );
          }
        } else {
          await tx.subscriptionInvoice.upsert({
            where: {
              subscriptionId_kind_periodKey: {
                subscriptionId: current.id,
                kind: isTrialPayment ? "TRIAL" : "RENEWAL",
                periodKey,
              },
            },
            update: { status: "FAILED", providerRef: webhook.providerRef },
            create: {
              subscriptionId: current.id,
              amountMinor: (
                await tx.planPrice.findUniqueOrThrow({ where: { id: current.priceId } })
              ).amountMinor,
              currency: current.currency,
              kind: isTrialPayment ? "TRIAL" : "RENEWAL",
              status: "FAILED",
              providerRef: webhook.providerRef,
              periodKey,
            },
          });
          await tx.subscription.update({
            where: { id: current.id },
            data: {
              status: "PAST_DUE",
              renewalStartedAt: null,
              pastDueSince: current.pastDueSince ?? now,
            },
          });
          await statusEvent(
            tx,
            current.id,
            current.status,
            "PAST_DUE",
            `Webhook ${webhook.type}`,
            "SYSTEM",
          );
        }
      }
      await tx.subscriptionWebhookEvent.update({
        where: { id: recorded.id },
        data: { subscriptionId: current.id },
      });
      return { duplicate: false, handled: true, ignored: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { duplicate: true, handled: false };
    throw error;
  }
}
