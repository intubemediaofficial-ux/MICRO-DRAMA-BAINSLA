import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
export async function GET() {
  const series = await prisma.series.findMany({
    where: { isPublished: true },
    include: { _count: { select: { episodes: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(series);
}
export async function POST(request: Request) {
  const { getSession } = await import("@/server/auth");
  const session = await getSession();
  if (session?.role !== "ADMIN")
    return NextResponse.json({ error: { message: "Forbidden" } }, { status: 403 });
  const { z } = await import("zod");
  const schema = z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    synopsis: z.string(),
    posterUrl: z.string(),
    teaserUrl: z.string(),
    genres: z.array(z.string()),
    tropeTags: z.array(z.string()),
    castNames: z.array(z.string()),
    freeEpisodeCount: z.number().int().nonnegative(),
    defaultCoinPrice: z.number().int().positive(),
    isPublished: z.boolean(),
  });
  try {
    const series = await prisma.series.create({ data: schema.parse(await request.json()) });
    return NextResponse.json(series, { status: 201 });
  } catch {
    return NextResponse.json({ error: { message: "Invalid series" } }, { status: 400 });
  }
}
