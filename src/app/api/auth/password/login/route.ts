import { NextResponse } from "next/server";
import { z } from "zod";
import { issueSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/password";

const INVALID = "Invalid email or password";
const input = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const data = input.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, role: true, isDisabled: true, passwordHash: true },
    });
    const valid = await verifyPassword(data.password, user?.passwordHash);
    if (!user || user.isDisabled || !valid) throw new Error(INVALID);
    await issueSession({ userId: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: { message: INVALID } }, { status: 401 });
  }
}
