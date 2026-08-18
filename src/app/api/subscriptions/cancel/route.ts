import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { cancelSubscription } from "@/server/subscriptions";

const input = z.object({
  subscriptionId: z.string().min(1),
  immediate: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const data = input.parse(await request.json());
    const subscription = await cancelSubscription(
      session.userId,
      data.subscriptionId,
      "USER",
      session.userId,
      data.immediate,
    );
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancellation failed";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
