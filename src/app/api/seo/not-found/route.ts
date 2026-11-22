import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { normalizeRedirectPath } from "@/server/cms";
import { publicContentWhere, publicSeriesWhere } from "@/server/publishing";

const inputSchema = z.object({
  path: z.string().trim().min(1).max(300),
});
const MAX_NOT_FOUND_LOGS = 2000;

function resolvesRedirectForPath(path: string, segments: string[]) {
  if (segments[0] === "watch" || segments[0] === "api") return false;
  if (path === "/subscribe") return false;
  if (segments[0] === "admin" && segments[1] === "series" && segments.length === 3)
    return false;
  if (segments[0] === "blog") return segments.length > 1;
  if (segments[0] === "series" && segments.length === 2) return true;
  return segments.length > 0;
}

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

async function resolvesToRealContent(path: string) {
  const segments = path.split("/").filter(Boolean);
  const contentLookup =
    segments.length === 1
      ? prisma.contentPage.findFirst({
          where: { slug: segments[0], ...publicContentWhere() },
          select: { id: true },
        })
      : segments.length === 2 && segments[0] === "blog"
        ? prisma.blogPost.findFirst({
            where: { slug: segments[1], ...publicContentWhere() },
            select: { id: true },
          })
        : segments.length === 2 && segments[0] === "series"
          ? prisma.series.findFirst({
              where: { slug: segments[1], ...publicSeriesWhere },
              select: { id: true },
            })
          : Promise.resolve(null);
  const [content, redirect] = await Promise.all([
    contentLookup,
    resolvesRedirectForPath(path, segments)
      ? prisma.redirect.findFirst({
          where: { fromPath: path, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return Boolean(content || redirect);
}

async function makeRoomForNewPath() {
  const count = await prisma.notFoundLog.count();
  if (count < MAX_NOT_FOUND_LOGS) return;
  const stale = await prisma.notFoundLog.findMany({
    orderBy: [{ lastSeenAt: "asc" }, { hits: "asc" }],
    take: count - MAX_NOT_FOUND_LOGS + 1,
    select: { id: true },
  });
  if (stale.length) {
    await prisma.notFoundLog.deleteMany({ where: { id: { in: stale.map(({ id }) => id) } } });
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
  if (await resolvesToRealContent(path)) return NextResponse.json({ ok: true });

  const referrer = safeReferrer(request);
  const existing = await prisma.notFoundLog.findUnique({ where: { path }, select: { id: true } });
  if (!existing) await makeRoomForNewPath();
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
