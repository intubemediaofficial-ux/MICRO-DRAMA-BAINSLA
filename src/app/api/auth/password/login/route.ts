import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { issueSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { PASSWORD_FAILURE_THRESHOLD, PASSWORD_LOCKOUT_MS, verifyPassword } from "@/server/password";

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
      select: { id: true },
    });
    if (!user) {
      await verifyPassword(data.password, null);
      throw new Error(INVALID);
    }
    let result: { session: { userId: string; role: "USER" | "ADMIN" } | null } | null = null;
    for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const current = await tx.user.findUnique({
              where: { id: user.id },
              select: {
                id: true,
                role: true,
                isDisabled: true,
                passwordHash: true,
                passwordFailedAttempts: true,
                passwordLockedUntil: true,
              },
            });
            if (!current) return { session: null };
            const valid = await verifyPassword(data.password, current.passwordHash);
            const now = new Date();
            if (current.isDisabled) return { session: null };
            if (current.passwordLockedUntil && current.passwordLockedUntil > now)
              return { session: null };
            if (valid) {
              await tx.user.update({
                where: { id: current.id },
                data: { passwordFailedAttempts: 0, passwordLockedUntil: null },
              });
              return { session: { userId: current.id, role: current.role } };
            }
            const attemptsSinceCooldown =
              current.passwordLockedUntil && current.passwordLockedUntil <= now
                ? 0
                : current.passwordFailedAttempts;
            const failedAttempts = attemptsSinceCooldown + 1;
            await tx.user.update({
              where: { id: current.id },
              data: {
                passwordFailedAttempts: failedAttempts,
                passwordLockedUntil:
                  failedAttempts >= PASSWORD_FAILURE_THRESHOLD
                    ? new Date(now.getTime() + PASSWORD_LOCKOUT_MS)
                    : null,
              },
            });
            return { session: null };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
          continue;
        throw error;
      }
    }
    if (!result?.session) throw new Error(INVALID);
    await issueSession(result.session);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: { message: INVALID } }, { status: 401 });
  }
}
