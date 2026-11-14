import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";

const input = z.object({ token: z.string().min(20).max(4_096) });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`push-token:${ip}`, 30))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  try {
    const { token } = input.parse(await request.json());
    const session = await getSession();
    await prisma.deviceToken.upsert({
      where: { token },
      create: { token, ...(session ? { userId: session.userId } : {}) },
      update: {
        lastSeenAt: new Date(),
        ...(session ? { userId: session.userId } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 400;
    return NextResponse.json({ error: { message: "Invalid push token" } }, { status });
  }
}
