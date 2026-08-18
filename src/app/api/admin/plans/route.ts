import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const price = z.object({
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  amountMinor: z.number().int().nonnegative(),
  trialAmountMinor: z.number().int().nonnegative(),
  countryCodes: z.array(z.string().length(2)).default([]),
  isActive: z.boolean().default(true),
});
const plan = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(80),
  trialDays: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  prices: z.array(price).min(1),
});

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.plan.findMany({ include: { prices: true }, orderBy: { createdAt: "asc" } }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = plan.parse(await request.json());
    return NextResponse.json(
      await prisma.plan.create({
        data: {
          code: data.code,
          name: data.name,
          trialDays: data.trialDays,
          isActive: data.isActive,
          prices: { create: data.prices },
        },
        include: { prices: true },
      }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan creation failed";
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
      .object({ id: z.string(), data: plan.omit({ code: true, prices: true }).partial() })
      .parse(await request.json());
    const updated = await prisma.plan.update({ where: { id: data.id }, data: data.data });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan update failed";
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
    if (await prisma.subscription.count({ where: { planId: id } }))
      throw new Error("PLAN_HAS_SUBSCRIPTIONS");
    await prisma.plan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : message === "PLAN_HAS_SUBSCRIPTIONS" ? 409 : 400 },
    );
  }
}
