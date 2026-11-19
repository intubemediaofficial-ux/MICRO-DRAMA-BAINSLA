import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { processRazorpayWebhook, verifyRazorpayWebhook } from "@/server/razorpay";
import { devPaymentsAllowed, subscriptionProvider } from "@/server/subscription-providers";
import { processSubscriptionWebhook } from "@/server/subscriptions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (
    (provider !== "dev" && provider !== "stripe" && provider !== "razorpay") ||
    (provider === "dev" && !devPaymentsAllowed())
  )
    return NextResponse.json({ error: { message: "Provider not found" } }, { status: 404 });
  const payload = await request.text();
  if (provider === "razorpay") {
    try {
      const event = verifyRazorpayWebhook(payload, request.headers.get("x-razorpay-signature"));
      const eventId =
        request.headers.get("x-razorpay-event-id") ??
        createHash("sha256").update(payload).digest("hex");
      return NextResponse.json({ ok: true, ...(await processRazorpayWebhook(eventId, event)) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook rejected";
      return NextResponse.json({ error: { message } }, { status: 400 });
    }
  }
  try {
    const adapter = subscriptionProvider();
    if (provider === "stripe" && adapter.name !== "STRIPE")
      return NextResponse.json({ error: { message: "Stripe is not configured" } }, { status: 503 });
    const webhook = adapter.verifyWebhook(payload, request.headers.get("stripe-signature"));
    const result = await processSubscriptionWebhook(adapter.name, webhook, JSON.parse(payload));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook rejected";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
