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
  z.object({ action: z.literal("password"), password: z.string().min(8).max(128) }),
  z.object({ action: z.literal("clearPassword") }),
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
        passwordHash: true,
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
    const { passwordHash, ...safeUser } = user;
    return NextResponse.json({ ...safeUser, hasPassword: Boolean(passwordHash) });
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
    if (data.action === "role") {
      await prisma.user.update({ where: { id }, data: { role: data.role } });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "disable") {
      if (id === session.userId && data.disabled) throw new Error("CANNOT_DISABLE_SELF");
      await prisma.user.update({ where: { id }, data: { isDisabled: data.disabled } });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "password") {
      const { hashPassword } = await import("@/server/password");
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(data.password) },
      });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "clearPassword") {
      await prisma.user.update({ where: { id }, data: { passwordHash: null } });
      return NextResponse.json({ ok: true });
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
