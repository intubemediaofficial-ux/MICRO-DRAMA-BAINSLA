import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { seriesCard } from "@/server/mobile";
import { publicEpisodeWhere, publicSeriesWhere } from "@/server/publishing";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
  const items = await prisma.series.findMany({
    where: {
      ...publicSeriesWhere,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { synopsis: { contains: q, mode: "insensitive" } },
              { genres: { has: q } },
              { tropeTags: { has: q } },
              { castNames: { has: q } },
            ],
          }
        : {}),
    },
    include: {
      episodes: {
        where: publicEpisodeWhere,
        orderBy: { number: "asc" },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: { title: "asc" },
    take: 50,
  });
  return NextResponse.json({ items: items.map(seriesCard) });
}
