import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { adjustCoins } from "@/server/coins";

const searchInput = z.object({ q: z.string().max(120).optional() });
const adjustmentInput = z.object({
  userId: z.string(),
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  reason: z.string().min(3).max(240),
});

export async function GET(request: Request) {
  try {
    await adminSession();
    const { q } = searchInput.parse(Object.fromEntries(new URL(request.url).searchParams));
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        isDisabled: true,
        coinBalance: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, currentPeriodEnd: true },
        },
      },
    });
    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : "User search failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await adminSession();
    const data = adjustmentInput.parse(await request.json());
    return NextResponse.json(
      await adjustCoins(data.userId, data.delta, data.reason, session.userId),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coin adjustment failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
