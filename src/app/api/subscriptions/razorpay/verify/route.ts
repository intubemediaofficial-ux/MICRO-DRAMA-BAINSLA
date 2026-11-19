import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { confirmRazorpayCheckout } from "@/server/razorpay";

const input = z.object({
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySubscriptionId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
  deviceFingerprint: z.string().trim().min(8).max(256).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const subscription = await confirmRazorpayCheckout(
      session.userId,
      input.parse(await request.json()),
    );
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed";
    const status =
      message === "SUBSCRIPTION_NOT_FOUND" ? 404 : message === "PAYMENTS_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ error: { message } }, { status });
  }
}
