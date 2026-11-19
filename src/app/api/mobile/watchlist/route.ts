import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { seriesCard } from "@/server/mobile";
import { prisma } from "@/server/db";
import { publicEpisodeWhere, publicSeriesWhere } from "@/server/publishing";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const items = await prisma.watchlistItem.findMany({
    where: { userId: session.userId, series: publicSeriesWhere },
    orderBy: { createdAt: "desc" },
    include: {
      series: {
        include: { episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" }, take: 1 } },
      },
    },
  });
  return NextResponse.json({ items: items.map((item) => seriesCard(item.series)) });
}
