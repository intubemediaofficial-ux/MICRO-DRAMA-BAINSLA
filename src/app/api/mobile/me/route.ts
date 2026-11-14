import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { resolveCurrency } from "@/server/currency";
import { prisma } from "@/server/db";
import { paymentsEnabled } from "@/server/subscription-providers";
import { getSubscriptionOffers, getUserSubscription, hasUsedTrial } from "@/server/subscriptions";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const [user, subscription, offers, trialUsed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, phone: true, role: true, coinBalance: true },
    }),
    getUserSubscription(session.userId),
    getSubscriptionOffers(resolveCurrency(request.headers)),
    hasUsedTrial(session.userId),
  ]);
  if (!user) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const now = new Date();
  const accessEnds =
    subscription?.status === "TRIALING" ? subscription.trialEndsAt : subscription?.currentPeriodEnd;
  const vipActive = Boolean(
    subscription &&
      ["TRIALING", "ACTIVE", "PAST_DUE"].includes(subscription.status) &&
      accessEnds &&
      accessEnds > now &&
      subscription.invoices.some((invoice) => invoice.status === "PAID"),
  );
  return NextResponse.json({
    user,
    vipActive,
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan.name,
          interval: subscription.plan.interval,
          accessEndsAt: accessEnds,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    trialUsed,
    paymentsEnabled: paymentsEnabled(),
    offers: offers.map(({ plan, price }) => ({
      code: plan.code,
      name: plan.name,
      interval: plan.interval,
      trialDays: plan.trialDays,
      currency: price.currency,
      amountMinor: price.amountMinor,
      trialAmountMinor: price.trialAmountMinor,
    })),
  });
}
