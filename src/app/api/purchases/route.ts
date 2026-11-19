import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { createRazorpayOrder } from "@/server/razorpay";
import { getSettings } from "@/server/settings";

const input = z.object({ bundleId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const { bundleId } = input.parse(await request.json());
    const settings = await getSettings();
    if (
      !settings.PAYMENTS_ENABLED ||
      !settings.RAZORPAY_KEY_ID ||
      !settings.RAZORPAY_KEY_SECRET
    )
      return NextResponse.json(
        { error: { message: "Coin packs open soon" } },
        { status: 503 },
      );
    const bundle = await prisma.coinBundle.findFirst({
      where: { id: bundleId, isActive: true },
    });
    if (!bundle)
      return NextResponse.json({ error: { message: "Bundle not found" } }, { status: 404 });

    const purchaseId = crypto.randomUUID();
    const purchase = await prisma.purchase.create({
      data: {
        id: purchaseId,
        userId: session.userId,
        bundleId: bundle.id,
        provider: "RAZORPAY",
        providerRef: `creating_${purchaseId}`,
        status: "PENDING",
        coinsGranted: bundle.coins + bundle.bonusCoins,
      },
    });
    try {
      const order = await createRazorpayOrder({
        amount: bundle.priceMinor,
        currency: bundle.currency,
        receipt: purchase.id,
        purchaseId: purchase.id,
        userId: session.userId,
      });
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { providerRef: order.id },
      });
      return NextResponse.json({
        orderId: order.id,
        keyId: settings.RAZORPAY_KEY_ID,
        amount: bundle.priceMinor,
        currency: bundle.currency,
        purchaseId: purchase.id,
      });
    } catch (error) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: { message: "Invalid purchase request" } },
        { status: 400 },
      );
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "PAYMENTS_UNAVAILABLE" ? 503 : message === "RAZORPAY_REQUEST_FAILED" ? 502 : 500;
    return NextResponse.json(
      {
        error: {
          message:
            status === 503
              ? "Coin packs open soon"
              : status === 502
                ? "Unable to start payment"
                : "Purchase could not be created",
        },
      },
      { status },
    );
  }
}
