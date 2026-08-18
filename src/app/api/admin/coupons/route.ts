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
