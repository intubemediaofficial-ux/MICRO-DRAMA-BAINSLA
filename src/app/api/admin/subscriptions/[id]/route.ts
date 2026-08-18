import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { cancelSubscription, adminExtendSubscription } from "@/server/subscriptions";
import { prisma } from "@/server/db";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), days: z.number().int().positive() }),
  z.object({ action: z.literal("cancel") }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await adminSession();
    const { id } = await params;
    const data = input.parse(await request.json());
    if (data.action === "extend")
      return NextResponse.json(await adminExtendSubscription(id, session.userId, data.days));
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id },
      select: { userId: true },
    });
    return NextResponse.json(
      await cancelSubscription(subscription.userId, id, "ADMIN", session.userId, true),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription admin request failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
