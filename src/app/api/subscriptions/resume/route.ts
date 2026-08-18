import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { resumeSubscription } from "@/server/subscription-actions";

const input = z.object({ subscriptionId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const { subscriptionId } = input.parse(await request.json());
    return NextResponse.json({
      ok: true,
      subscription: await resumeSubscription(session.userId, subscriptionId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resume subscription";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
