import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/server/auth";
import { prisma } from "@/server/db";

export async function POST(request: Request) {
  let pushToken: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.pushToken === "string") pushToken = body.pushToken;
  } catch {
    // Web logout requests do not include a body.
  }
  const session = await getSession();
  if (session && pushToken) {
    await prisma.deviceToken.updateMany({
      where: { token: pushToken, userId: session.userId },
      data: { userId: null, lastSeenAt: new Date() },
    });
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
