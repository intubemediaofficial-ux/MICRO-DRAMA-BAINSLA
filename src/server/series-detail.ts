import { prisma } from "./db";
import { resolveSeriesEpisodeEntitlements } from "./entitlements";
import { getWatchedEpisodeIds } from "./discovery";
import { publicEpisodeWhere } from "./publishing";

export async function getSeriesDetail(slug: string, userId: string | null) {
  const series = await prisma.series.findFirst({
    where: { slug },
    include: {
      episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" } },
      seasons: {
        orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
        include: { episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" } } },
      },
      castMembers: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!series?.isPublished || !series.episodes.length) return null;
  const [entitlementByEpisodeId, watchedIds, progressRows] = await Promise.all([
    resolveSeriesEpisodeEntitlements(userId, series.episodes, series.freeEpisodeCount),
    userId
      ? getWatchedEpisodeIds(
          userId,
          series.episodes.map((episode) => episode.id),
        )
      : Promise.resolve(new Set<string>()),
    userId
      ? prisma.watchProgress.findMany({
          where: { userId, episodeId: { in: series.episodes.map((episode) => episode.id) } },
          orderBy: { updatedAt: "desc" },
          select: { episodeId: true, positionSec: true, completed: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const progressByEpisodeId = new Map(
    progressRows.map((progress) => [progress.episodeId, progress]),
  );
  const toEpisodeView = (episode: (typeof series.episodes)[number]) => ({
    id: episode.id,
    number: episode.number,
    title: episode.title,
    durationSec: episode.durationSec,
    thumbnailUrl: episode.thumbnailUrl,
    isFree: episode.isFree,
    coinPrice: episode.coinPrice,
    watched: watchedIds.has(episode.id),
    completed: progressByEpisodeId.get(episode.id)?.completed ?? false,
    positionSec: progressByEpisodeId.get(episode.id)?.positionSec ?? 0,
    progressUpdatedAt: progressByEpisodeId.get(episode.id)?.updatedAt ?? null,
    access: entitlementByEpisodeId.get(episode.id)?.reason ?? "LOCKED",
  });
  const assignedEpisodeIds = new Set(
    series.seasons.flatMap((season) => season.episodes.map((episode) => episode.id)),
  );
  const seasonGroups = series.seasons.length
    ? series.seasons.map((season, index) => {
        const episodes = season.episodes.map(toEpisodeView);
        if (index !== 0) return { ...season, episodes };
        const unassignedEpisodes = series.episodes
          .filter((episode) => !assignedEpisodeIds.has(episode.id))
          .map(toEpisodeView);
        return {
          ...season,
          episodes: [...episodes, ...unassignedEpisodes].sort((a, b) => a.number - b.number),
        };
      })
    : [
        {
          id: "legacy",
          number: 1,
          title: "Season 1",
          episodes: series.episodes.map(toEpisodeView),
        },
      ];
  return { series, seasonGroups };
}
