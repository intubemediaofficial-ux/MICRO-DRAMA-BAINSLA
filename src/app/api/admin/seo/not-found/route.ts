import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET() {
  try {
    await adminSession();
    const notFound = await prisma.notFoundLog.findMany({ orderBy: [{ hits: "desc" }, { lastSeenAt: "desc" }] });
    return NextResponse.json({ notFound });
  } catch (error) {
    return errorResponse(error, "404 log lookup failed");
  }
}

export async function DELETE() {
  try {
    await adminSession();
    await prisma.notFoundLog.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "404 log clear failed");
  }
}
