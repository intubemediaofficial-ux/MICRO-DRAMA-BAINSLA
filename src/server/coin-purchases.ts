import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { getSettings } from "./settings";

function safeEqual(left: string, right: string) {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export async function verifyRazorpayCoinPurchase(
  userId: string,
  input: { orderId: string; paymentId: string; signature: string },
) {
  const settings = await getSettings();
  if (!settings.RAZORPAY_KEY_SECRET) throw new Error("PAYMENTS_UNAVAILABLE");
  const expected = createHmac("sha256", settings.RAZORPAY_KEY_SECRET)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  if (!safeEqual(expected, input.signature)) throw new Error("INVALID_PAYMENT_SIGNATURE");
  const purchase = await prisma.purchase.findFirst({
    where: {
      provider: "RAZORPAY",
      providerRef: input.orderId,
      userId,
    },
    select: { id: true },
  });
  if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
  return completeRazorpayCoinPurchase(input.orderId);
}

export async function completeRazorpayCoinPurchase(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { provider: "RAZORPAY", providerRef: orderId },
    });
    if (!purchase) return { found: false, completed: false };
    const result = await tx.purchase.updateMany({
      where: { id: purchase.id, status: "PENDING" },
      data: { status: "COMPLETED" },
    });
    if (result.count !== 1) return { found: true, completed: false };
    const updated = await tx.user.updateMany({
      where: { id: purchase.userId },
      data: { coinBalance: { increment: purchase.coinsGranted } },
    });
    if (updated.count !== 1) throw new Error("USER_NOT_FOUND");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: purchase.userId },
      select: { coinBalance: true },
    });
    await tx.coinTransaction.create({
      data: {
        userId: purchase.userId,
        delta: purchase.coinsGranted,
        type: "PURCHASE",
        balanceAfter: user.coinBalance,
        refType: "purchase",
        refId: purchase.id,
      },
    });
    return { found: true, completed: true };
  });
}
