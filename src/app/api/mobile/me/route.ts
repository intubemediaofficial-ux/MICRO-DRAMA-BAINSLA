import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { resolveCurrency } from "@/server/currency";
import { prisma } from "@/server/db";
import { paymentsEnabled } from "@/server/subscription-providers";
import { getSubscriptionOffers, getUserSubscription, hasUsedTrial } from "@/server/subscriptions";
import { getSettings } from "@/server/settings";
import { env } from "@/server/config";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const [currency, paymentsAvailable] = await Promise.all([
    resolveCurrency(request.headers),
    paymentsEnabled(),
  ]);
  const [user, subscription, offers, trialUsed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        coinBalance: true,
        referralCode: true,
      },
    }),
    getUserSubscription(session.userId),
    getSubscriptionOffers(currency),
    hasUsedTrial(session.userId),
  ]);
  if (!user) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const settings = await getSettings();
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
    paymentsEnabled: paymentsAvailable,
    referralCode: user.referralCode,
    referralLink: `${env.NEXT_PUBLIC_APP_URL}/?ref=${encodeURIComponent(user.referralCode)}`,
    referralBonusCoins: settings.REFERRAL_BONUS_COINS,
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
