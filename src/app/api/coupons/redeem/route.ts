import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";

const input = z.object({
  code: z
    .string()
    .min(3)
    .transform((value) => value.toUpperCase()),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const { code } = input.parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.isActive || (coupon.expiresAt && coupon.expiresAt < new Date())) {
        throw new Error("COUPON_INVALID");
      }
      const redeemed = await tx.coupon.updateMany({
        where: { id: coupon.id, redeemedCount: { lt: coupon.maxRedemptions } },
        data: { redeemedCount: { increment: 1 } },
      });
      if (!redeemed.count) throw new Error("COUPON_EXHAUSTED");
      await tx.couponRedemption.create({ data: { userId: session.userId, couponId: coupon.id } });
      await tx.user.update({
        where: { id: session.userId },
        data: { coinBalance: { increment: coupon.coins } },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { coinBalance: true },
      });
      await tx.coinTransaction.create({
        data: {
          userId: session.userId,
          delta: coupon.coins,
          type: "ADMIN_ADJUST",
          balanceAfter: user.coinBalance,
          refType: "coupon",
          refId: coupon.id,
        },
      });
      return { coins: coupon.coins };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "COUPON_ALREADY_REDEEMED"
        : error instanceof Error
          ? error.message
          : "Coupon redemption failed";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
