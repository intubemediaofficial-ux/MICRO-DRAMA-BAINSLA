import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  planId: z.string(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  amountMinor: z.number().int().nonnegative(),
  trialAmountMinor: z.number().int().nonnegative(),
  countryCodes: z.array(z.string().length(2)).default([]),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.planPrice.findMany({ orderBy: [{ planId: "asc" }, { currency: "asc" }] }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.planPrice.create({ data: input.parse(await request.json()) }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price creation failed";
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
      .object({ id: z.string(), data: input.omit({ planId: true }).partial() })
      .parse(await request.json());
    return NextResponse.json(
      await prisma.planPrice.update({ where: { id: data.id }, data: data.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price update failed";
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
    if (await prisma.subscription.count({ where: { priceId: id } }))
      throw new Error("PRICE_HAS_SUBSCRIPTIONS");
    await prisma.planPrice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : message === "PRICE_HAS_SUBSCRIPTIONS" ? 409 : 400 },
    );
  }
}
