import { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Ranked = { id: string; score?: bigint; latest?: Date };

export async function getWatchedEpisodeIds(userId: string, episodeIds: string[]) {
  const rows = await prisma.watchProgress.findMany({
    where: { userId, episodeId: { in: episodeIds } },
    select: { episodeId: true },
  });
  return new Set(rows.map((row) => row.episodeId));
}

async function orderedSeries(rows: Ranked[]) {
  if (!rows.length) return [];
  const items = await prisma.series.findMany({
    where: { id: { in: rows.map((row) => row.id) }, isPublished: true },
    include: { episodes: { orderBy: { number: "asc" }, take: 1 } },
  });
  const rank = new Map(rows.map((row, index) => [row.id, index]));
  return items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export async function getDiscovery(userId?: string) {
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
  // For You scores genre/trope affinity from the viewer's own progress and unlock history.
  const forYouRows = userId
    ? await prisma.$queryRaw<Ranked[]>(
        Prisma.sql`
          WITH history AS (
            SELECT unnest(s.genres) AS tag
            FROM "WatchProgress" wp
            INNER JOIN "Episode" e ON e.id = wp."episodeId"
            INNER JOIN "Series" s ON s.id = e."seriesId"
            WHERE wp."userId" = ${userId}
            UNION ALL
            SELECT unnest(s."tropeTags") AS tag
            FROM "WatchProgress" wp
            INNER JOIN "Episode" e ON e.id = wp."episodeId"
            INNER JOIN "Series" s ON s.id = e."seriesId"
            WHERE wp."userId" = ${userId}
            UNION ALL
            SELECT unnest(s.genres) AS tag
            FROM "EpisodeUnlock" eu
            INNER JOIN "Episode" e ON e.id = eu."episodeId"
            INNER JOIN "Series" s ON s.id = e."seriesId"
            WHERE eu."userId" = ${userId}
            UNION ALL
            SELECT unnest(s."tropeTags") AS tag
            FROM "EpisodeUnlock" eu
            INNER JOIN "Episode" e ON e.id = eu."episodeId"
            INNER JOIN "Series" s ON s.id = e."seriesId"
            WHERE eu."userId" = ${userId}
          ),
          affinity AS (
            SELECT tag, COUNT(*) AS weight
            FROM history
            GROUP BY tag
          )
          SELECT s.id, SUM(a.weight) AS score
          FROM "Series" s
          INNER JOIN affinity a ON a.tag = ANY(s.genres) OR a.tag = ANY(s."tropeTags")
          WHERE s."isPublished" = true
          GROUP BY s.id
          ORDER BY score DESC, s.title ASC
          LIMIT 8
        `,
      )
    : [];
  const all = await prisma.series.findMany({
    where: { isPublished: true },
    include: { episodes: { orderBy: { number: "asc" }, take: 1 } },
    orderBy: { title: "asc" },
  });
  const genres = [...new Set(all.flatMap((item) => item.genres))];
  const tropes = [...new Set(all.flatMap((item) => item.tropeTags))];
  return {
    trending: await orderedSeries(trendingRows),
    forYou: await orderedSeries(forYouRows.length ? forYouRows : trendingRows),
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
