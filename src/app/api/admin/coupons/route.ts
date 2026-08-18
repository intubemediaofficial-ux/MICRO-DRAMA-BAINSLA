import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  code: z
    .string()
    .min(3)
    .transform((value) => value.toUpperCase()),
  coins: z.number().int().positive(),
  maxRedemptions: z.number().int().positive(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.coupon.create({ data: input.parse(await request.json()) }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coupon creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(await prisma.coupon.findMany({ orderBy: { code: "asc" } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coupon lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const data = z.object({ id: z.string(), data: input.partial() }).parse(await request.json());
    return NextResponse.json(
      await prisma.coupon.update({ where: { id: data.id }, data: data.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coupon update failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await adminSession();
    const { id } = z.object({ id: z.string() }).parse(await request.json());
    if (await prisma.couponRedemption.count({ where: { couponId: id } }))
      throw new Error("COUPON_HAS_REDEMPTIONS");
    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coupon deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : message === "COUPON_HAS_REDEMPTIONS" ? 409 : 400 },
    );
  }
}
