import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { verifyRazorpayCoinPurchase } from "@/server/coin-purchases";

const input = z.object({
  razorpay_order_id: z.string().min(1).max(128),
  razorpay_payment_id: z.string().min(1).max(128),
  razorpay_signature: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const payload = input.parse(await request.json());
    const result = await verifyRazorpayCoinPurchase(session.userId, {
      orderId: payload.razorpay_order_id,
      paymentId: payload.razorpay_payment_id,
      signature: payload.razorpay_signature,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: { message: "Invalid payment verification" } },
        { status: 400 },
      );
    const message = error instanceof Error ? error.message : "Payment verification failed";
    const status =
      message === "PAYMENTS_UNAVAILABLE"
        ? 503
        : message === "PURCHASE_NOT_FOUND"
          ? 404
          : message === "INVALID_PAYMENT_SIGNATURE"
            ? 400
            : 500;
    return NextResponse.json(
      {
        error: {
          message:
            status === 503
              ? "Coin packs open soon"
              : status === 404
                ? "Purchase not found"
                : status === 400
                  ? "Invalid payment signature"
                  : "Payment verification failed",
        },
      },
      { status },
    );
  }
}
