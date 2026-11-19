import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { normalizeRedirectPath } from "@/server/cms";

const patchSchema = z.object({
  fromPath: z.string().min(1).max(300).optional(),
  toPath: z.string().min(1).max(300).optional(),
  permanent: z.boolean().optional(),
  active: z.boolean().optional(),
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_REDIRECT_PATH" ? 400 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const redirect = await prisma.redirect.update({
      where: { id },
      data: {
        ...data,
        ...(data.fromPath !== undefined ? { fromPath: normalizeRedirectPath(data.fromPath) } : {}),
        ...(data.toPath !== undefined ? { toPath: normalizeRedirectPath(data.toPath) } : {}),
      },
    });
    return NextResponse.json({ redirect });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid redirect" } }, { status: 400 });
    return errorResponse(error, "Redirect update failed");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    await prisma.redirect.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Redirect deletion failed");
  }
}
