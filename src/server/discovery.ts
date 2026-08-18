import { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Ranked = { id: string; score?: bigint; latest?: Date };

async function orderedSeries(rows: Ranked[]) {
  if (!rows.length) return [];
  const items = await prisma.series.findMany({
    where: { id: { in: rows.map((row) => row.id) }, isPublished: true },
    include: { episodes: { orderBy: { number: "asc" }, take: 1 } },
  });
  const rank = new Map(rows.map((row, index) => [row.id, index]));
  return items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export async function getDiscovery() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  // Trending score is distinct unlocks plus distinct likes per series during the last seven days.
  const trendingRows = await prisma.$queryRaw<Ranked[]>(
    Prisma.sql`
      SELECT s.id, COUNT(DISTINCT eu.id) + COUNT(DISTINCT el.id) AS score
      FROM "Series" s
      LEFT JOIN "Episode" e ON e."seriesId" = s.id
      LEFT JOIN "EpisodeUnlock" eu ON eu."episodeId" = e.id AND eu."createdAt" >= ${since}
      LEFT JOIN "EpisodeLike" el ON el."episodeId" = e.id AND el."createdAt" >= ${since}
      WHERE s."isPublished" = true
      GROUP BY s.id
      ORDER BY score DESC, s."createdAt" DESC
      LIMIT 8
    `,
  );
  // New releases are ordered by the most recently published episode in each series.
  const newReleaseRows = await prisma.$queryRaw<Ranked[]>(
    Prisma.sql`
      SELECT s.id, MAX(e."publishedAt") AS latest
      FROM "Series" s
      JOIN "Episode" e ON e."seriesId" = s.id
      WHERE s."isPublished" = true
      GROUP BY s.id
      ORDER BY latest DESC NULLS LAST
      LIMIT 8
    `,
  );
  const all = await prisma.series.findMany({
    where: { isPublished: true },
    include: { episodes: { orderBy: { number: "asc" }, take: 1 } },
    orderBy: { title: "asc" },
  });
  const genres = [...new Set(all.flatMap((item) => item.genres))];
  const tropes = [...new Set(all.flatMap((item) => item.tropeTags))];
  return {
    trending: await orderedSeries(trendingRows),
    newReleases: await orderedSeries(newReleaseRows),
    genreRows: genres.map((genre) => ({
      title: genre,
      items: all.filter((item) => item.genres.includes(genre)),
    })),
    tropeRows: tropes.map((trope) => ({
      title: trope,
      items: all.filter((item) => item.tropeTags.includes(trope)),
    })),
  };
}
