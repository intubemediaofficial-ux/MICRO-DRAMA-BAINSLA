import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  coins: z.number().int().positive(),
  bonusCoins: z.number().int().nonnegative(),
  priceMinor: z.number().int().positive(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
});

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(await prisma.coinBundle.findMany({ orderBy: { sortOrder: "asc" } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bundle lookup failed";
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
      await prisma.coinBundle.create({ data: input.parse(await request.json()) }),
      {
        status: 201,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bundle creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const data = z.object({ id: z.string(), data: input.partial() }).parse(await request.json());
    return NextResponse.json(
      await prisma.coinBundle.update({ where: { id: data.id }, data: data.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bundle update failed";
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
    if (await prisma.purchase.count({ where: { bundleId: id } }))
      throw new Error("BUNDLE_HAS_PURCHASE_HISTORY");
    await prisma.coinBundle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bundle deletion failed";
    return NextResponse.json(
      { error: { message } },
      {
        status:
          message === "FORBIDDEN" ? 403 : message === "BUNDLE_HAS_PURCHASE_HISTORY" ? 409 : 400,
      },
    );
  }
}
