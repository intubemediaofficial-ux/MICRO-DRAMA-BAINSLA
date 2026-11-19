import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { normalizeRedirectPath } from "@/server/cms";

const inputSchema = z.object({
  path: z.string().trim().min(1).max(300),
});

function safeReferrer(request: Request) {
  const value = request.headers.get("referer");
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  if (!rateLimit(`seo-not-found:${ip}`, 30, 60_000))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });

  let data: z.infer<typeof inputSchema>;
  try {
    data = inputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: { message: "Invalid path" } }, { status: 400 });
  }

  let path: string;
  try {
    path = normalizeRedirectPath(data.path).slice(0, 300);
  } catch {
    return NextResponse.json({ error: { message: "Invalid path" } }, { status: 400 });
  }
  const referrer = safeReferrer(request);
  const existing = await prisma.notFoundLog.findUnique({ where: { path }, select: { id: true } });
  if (!existing && (await prisma.notFoundLog.count()) > 2000)
    return NextResponse.json({ ok: true });
  try {
    await prisma.notFoundLog.upsert({
      where: { path },
      create: { path, referrer },
      update: { hits: { increment: 1 }, lastSeenAt: new Date(), referrer },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    await prisma.notFoundLog.update({
      where: { path },
      data: { hits: { increment: 1 }, lastSeenAt: new Date(), referrer },
    });
  }
  return NextResponse.json({ ok: true });
}
