import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  code: z
    .string()
    .min(2)
    .max(32)
    .transform((value) => value.toUpperCase()),
  type: z.enum(["PERCENT", "FIXED_MINOR"]),
  value: z.number().int().nonnegative(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  maxRedemptions: z.number().int().positive(),
  isActive: z.boolean().default(true),
  planIds: z.array(z.string()).default([]),
});

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.discountCode.findMany({
        include: { plans: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discount lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    return NextResponse.json(
      await prisma.discountCode.create({
        data: {
          code: data.code,
          type: data.type,
          value: data.value,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          maxRedemptions: data.maxRedemptions,
          isActive: data.isActive,
          plans: { create: data.planIds.map((planId) => ({ planId })) },
        },
      }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discount creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const data = z
      .object({ id: z.string(), data: input.omit({ planIds: true }).partial() })
      .parse(await request.json());
    return NextResponse.json(
      await prisma.discountCode.update({ where: { id: data.id }, data: data.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discount update failed";
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
    if (await prisma.subscriptionDiscountRedemption.count({ where: { discountCodeId: id } }))
      throw new Error("DISCOUNT_HAS_REDEMPTIONS");
    await prisma.discountCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discount deletion failed";
    return NextResponse.json(
      { error: { message } },
      {
        status: message === "FORBIDDEN" ? 403 : message === "DISCOUNT_HAS_REDEMPTIONS" ? 409 : 400,
      },
    );
  }
}
