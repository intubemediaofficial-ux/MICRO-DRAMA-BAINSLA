import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveEpisodeEntitlement } from "@/server/entitlements";
import { getWatchedEpisodeIds } from "@/server/discovery";
import WatchClient from "./watch-client";

export default async function WatchPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const session = await getSession();
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      series: {
        include: {
          episodes: { orderBy: { number: "asc" } },
          seasons: {
            orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
            include: { episodes: { select: { id: true } } },
          },
        },
      },
      subtitles: { select: { lang: true } },
    },
  });
  if (!episode) notFound();
  const seriesEpisodes = episode.series.episodes;
  const episodeIndex = seriesEpisodes.findIndex((item) => item.id === episode.id);
  const episodeIds = seriesEpisodes.map((item) => item.id);
  const [entitlements, watchedIds] = await Promise.all([
    Promise.all(
      seriesEpisodes.map((item) => resolveEpisodeEntitlement(session?.userId ?? null, item.id)),
    ),
    session ? getWatchedEpisodeIds(session.userId, episodeIds) : Promise.resolve(new Set<string>()),
  ]);
  const entitlementById = new Map(
    seriesEpisodes.map((item, index) => [item.id, entitlements[index]]),
  );
  const seasonByEpisodeId = new Map<string, number>();
  for (const season of episode.series.seasons) {
    for (const item of season.episodes) seasonByEpisodeId.set(item.id, season.number);
  }
  const earliestSeasonNumber = episode.series.seasons[0]?.number ?? 1;
  const railEpisodes = seriesEpisodes.map((item) => ({
    id: item.id,
    number: item.number,
    seasonNumber: seasonByEpisodeId.get(item.id) ?? earliestSeasonNumber,
    title: item.title,
    thumbnailUrl: item.thumbnailUrl || episode.series.posterUrl,
    entitled: entitlementById.get(item.id)?.entitled ?? false,
    watched: watchedIds.has(item.id),
  }));
  return (
    <div className="min-h-screen bg-black pb-16">
      <Link
        href={`/series/${episode.series.slug}`}
        className="fixed left-4 top-4 z-20 rounded-full bg-black/60 px-4 py-2"
      >
        ← {episode.series.title}
      </Link>
      <WatchClient
        episodeId={episode.id}
        title={episode.title}
        nextId={seriesEpisodes[episodeIndex + 1]?.id ?? null}
        nextLocked={
          seriesEpisodes[episodeIndex + 1]
            ? !entitlementById.get(seriesEpisodes[episodeIndex + 1].id)?.entitled
            : false
        }
        previousId={seriesEpisodes[episodeIndex - 1]?.id ?? null}
        episodes={railEpisodes}
        subtitles={episode.subtitles.map((subtitle) => ({
          lang: subtitle.lang,
          url: `/api/episodes/${episode.id}/subtitles/${subtitle.lang}`,
        }))}
      />
    </div>
  );
}
