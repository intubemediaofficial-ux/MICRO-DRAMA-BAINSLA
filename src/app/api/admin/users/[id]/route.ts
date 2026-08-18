import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { adminExtendSubscription, cancelSubscription } from "@/server/subscriptions";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("role"), role: z.enum(["USER", "ADMIN"]) }),
  z.object({ action: z.literal("disable"), disabled: z.boolean() }),
  z.object({
    action: z.literal("extend"),
    subscriptionId: z.string(),
    days: z.number().int().positive(),
  }),
  z.object({ action: z.literal("cancel"), subscriptionId: z.string() }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        isDisabled: true,
        coinBalance: true,
        createdAt: true,
        transactions: { orderBy: { createdAt: "desc" }, take: 50 },
        unlocks: {
          orderBy: { createdAt: "desc" },
          include: { episode: { include: { series: true } } },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: { plan: true, price: true, invoices: { orderBy: { createdAt: "desc" } } },
        },
      },
    });
    return NextResponse.json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "User lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 404 },
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await adminSession();
    const { id } = await params;
    const data = input.parse(await request.json());
    if (data.action === "role")
      return NextResponse.json(
        await prisma.user.update({ where: { id }, data: { role: data.role } }),
      );
    if (data.action === "disable") {
      if (id === session.userId && data.disabled) throw new Error("CANNOT_DISABLE_SELF");
      return NextResponse.json(
        await prisma.user.update({ where: { id }, data: { isDisabled: data.disabled } }),
      );
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true } });
    if (data.action === "extend")
      return NextResponse.json(
        await adminExtendSubscription(data.subscriptionId, session.userId, data.days),
      );
    return NextResponse.json(
      await cancelSubscription(user.id, data.subscriptionId, "ADMIN", session.userId, true),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "User update failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
