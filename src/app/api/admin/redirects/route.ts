import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { normalizeRedirectPath } from "@/server/cms";

const redirectInput = z.object({
  fromPath: z.string().min(1).max(300),
  toPath: z.string().min(1).max(300),
  permanent: z.boolean().default(true),
  active: z.boolean().default(true),
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_REDIRECT_PATH" ? 400
        : message === "REDIRECT_EXISTS" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET() {
  try {
    await adminSession();
    const redirects = await prisma.redirect.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ redirects });
  } catch (error) {
    return errorResponse(error, "Redirect lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = redirectInput.parse(await request.json());
    const redirect = await prisma.redirect.create({
      data: {
        ...data,
        fromPath: normalizeRedirectPath(data.fromPath),
        toPath: normalizeRedirectPath(data.toPath),
      },
    });
    return NextResponse.json({ redirect }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid redirect" } }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      return errorResponse(new Error("REDIRECT_EXISTS"), "Redirect already exists");
    return errorResponse(error, "Redirect creation failed");
  }
}
