import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/password";

const input = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireUser();
    const data = input.parse(await request.json());
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(data.currentPassword, user.passwordHash)))
      throw new Error("CURRENT_PASSWORD_INCORRECT");
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password change failed";
    return NextResponse.json(
      {
        error: {
          message: message === "CURRENT_PASSWORD_INCORRECT" ? message : "Password change failed",
        },
      },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}
