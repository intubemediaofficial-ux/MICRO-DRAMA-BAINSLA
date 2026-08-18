import { NextResponse } from "next/server";
import { resolveCurrency } from "@/server/currency";
import { getSubscriptionOffer } from "@/server/subscriptions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const planCode = url.searchParams.get("plan") ?? "VIP_ANNUAL";
  const currency = resolveCurrency(request.headers);
  const offer = await getSubscriptionOffer(planCode, currency);
  if (!offer) return NextResponse.json({ error: { message: "Plan unavailable" } }, { status: 404 });
  return NextResponse.json({
    currency,
    plan: {
      code: offer.plan.code,
      name: offer.plan.name,
      interval: offer.plan.interval,
      trialDays: offer.plan.trialDays,
    },
    price: {
      currency: offer.price.currency,
      amountMinor: offer.price.amountMinor,
      trialAmountMinor: offer.price.trialAmountMinor,
    },
  });
}
