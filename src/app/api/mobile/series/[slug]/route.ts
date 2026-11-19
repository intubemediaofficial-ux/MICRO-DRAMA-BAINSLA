import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSeriesDetail } from "@/server/series-detail";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  const detail = await getSeriesDetail(
    decodeURIComponent((await params).slug),
    session?.userId ?? null,
  );
  if (!detail?.series.isPublished)
    return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  const { series, seasonGroups } = detail;
  const inWatchlist = session
    ? Boolean(
        await prisma.watchlistItem.findUnique({
          where: { userId_seriesId: { userId: session.userId, seriesId: series.id } },
          select: { id: true },
        }),
      )
    : false;
  return NextResponse.json({
    id: series.id,
    slug: series.slug,
    title: series.title,
    synopsis: series.synopsis,
    posterUrl: series.posterUrl,
    genres: series.genres,
    tropeTags: series.tropeTags,
    freeEpisodeCount: series.freeEpisodeCount,
    inWatchlist,
    seasons: seasonGroups.map((season) => ({
      number: season.number,
      title: season.title,
      episodes: season.episodes,
    })),
  });
}
