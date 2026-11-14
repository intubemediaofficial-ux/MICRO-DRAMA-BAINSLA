import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { detectCountry, resolveCurrency } from "@/server/currency";
import { createRazorpayCheckout, razorpayConfigured } from "@/server/razorpay";
import { getUserSubscription, purchasePlan, startTrial } from "@/server/subscriptions";

const input = z.object({
  planCode: z.string().min(1).default("VIP_ANNUAL"),
  discountCode: z.string().trim().min(1).max(32).optional(),
  mode: z.enum(["trial", "paid", "annual"]).default("trial"),
  deviceFingerprint: z.string().trim().min(8).max(256).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  return NextResponse.json(await getUserSubscription(session.userId));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const data = input.parse(await request.json());
    if (razorpayConfigured()) {
      const checkout = await createRazorpayCheckout(
        session.userId,
        data.planCode,
        data.mode === "trial" ? "TRIAL" : "PAID",
        data.deviceFingerprint,
      );
      return NextResponse.json({ ok: true, checkout });
    }
    const currency = resolveCurrency(request.headers);
    const country = detectCountry(request.headers) ?? "IN";
    const subscription =
      data.mode !== "trial"
        ? await purchasePlan(session.userId, data.planCode, currency, country, data.discountCode)
        : await startTrial(
            session.userId,
            data.planCode,
            currency,
            country,
            data.discountCode,
            new Date(),
            data.deviceFingerprint,
          );
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription failed";
    const status =
      message === "PLAN_NOT_FOUND" || message === "PRICE_NOT_FOUND"
        ? 404
        : message === "INVALID_DISCOUNT" ||
            message === "TRIAL_ALREADY_USED" ||
            message === "TRIAL_NOT_AVAILABLE" ||
            message === "TRIAL_EMAIL_REQUIRED"
          ? 422
          : message === "SUBSCRIPTION_EXISTS"
            ? 409
            : message === "PAYMENTS_UNAVAILABLE" || message === "RAZORPAY_REQUEST_FAILED"
              ? 503
              : 400;
    return NextResponse.json({ error: { message } }, { status });
  }
}
