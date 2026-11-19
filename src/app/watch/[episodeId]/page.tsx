import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveSeriesEpisodeEntitlements } from "@/server/entitlements";
import { getWatchedEpisodeIds } from "@/server/discovery";
import { findPublicEpisode, publicEpisodeWhere } from "@/server/publishing";
import { SeoFieldsSchema } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { getSeoGlobal } from "@/server/site-config";
import { breadcrumbList, faqPageSchema, schemaTypeFor, tvEpisodeSchema } from "@/server/structured-data";
import WatchClient from "./watch-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}): Promise<Metadata> {
  const { episodeId } = await params;
  const episode = await findPublicEpisode(episodeId);
  if (!episode) return {};
  return buildMetadata({
    kind: "episode",
    path: `/watch/${encodeURIComponent(episode.id)}`,
    title: episode.title,
    excerpt: episode.title,
    image: episode.thumbnailUrl || episode.series.posterUrl,
    seo: episode.seo,
    vars: { series: episode.series.title, episode: episode.number },
    publishedAt: episode.publishedAt,
  });
}

export default async function WatchPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const session = await getSession();
  if (!(await findPublicEpisode(episodeId))) notFound();
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, ...publicEpisodeWhere, series: { isPublished: true } },
    include: {
      series: {
        include: {
          episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" } },
          seasons: {
            orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
            include: { episodes: { where: publicEpisodeWhere, select: { id: true } } },
          },
        },
      },
      subtitles: { select: { lang: true } },
    },
  });
  if (!episode) notFound();
  const [global] = await Promise.all([getSeoGlobal()]);
  const seoResult = SeoFieldsSchema.safeParse(episode.seo);
  const seo = seoResult.success ? seoResult.data : {};
  const schemaType = schemaTypeFor("episode", seo.schemaType);
  const episodeUrl = `${SITE_ORIGIN}/watch/${encodeURIComponent(episode.id)}`;
  const breadcrumbs = breadcrumbList([
    { name: global.siteName, url: `${SITE_ORIGIN}/` },
    { name: episode.series.title, url: `${SITE_ORIGIN}/series/${encodeURIComponent(episode.series.slug)}` },
    { name: seo.breadcrumbTitle || `Episode ${episode.number}`, url: episodeUrl },
  ]);
  const entitySchema = schemaType === "None"
    ? null
    : schemaType === "FAQPage" && seo.faq?.length
      ? faqPageSchema(seo.faq)
      : tvEpisodeSchema({
          name: episode.title,
          description: seo.description || episode.title,
          url: episodeUrl,
          episodeNumber: episode.number,
          seriesName: episode.series.title,
          seriesUrl: `${SITE_ORIGIN}/series/${encodeURIComponent(episode.series.slug)}`,
          thumbnailUrl: episode.thumbnailUrl || episode.series.posterUrl,
          durationSec: episode.durationSec,
          publishedAt: episode.publishedAt,
        });
  const seriesEpisodes = episode.series.episodes;
  const episodeIndex = seriesEpisodes.findIndex((item) => item.id === episode.id);
  const episodeIds = seriesEpisodes.map((item) => item.id);
  const [entitlementById, watchedIds] = await Promise.all([
    resolveSeriesEpisodeEntitlements(
      session?.userId ?? null,
      seriesEpisodes,
      episode.series.freeEpisodeCount,
    ),
    session ? getWatchedEpisodeIds(session.userId, episodeIds) : Promise.resolve(new Set<string>()),
  ]);
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
    entitled: entitlementById.get(item.id)?.entitled ?? false,
    watched: watchedIds.has(item.id),
  }));
  return (
    <div className="min-h-screen bg-black pb-16">
      <JsonLd data={breadcrumbs} />
      {entitySchema && <JsonLd data={entitySchema} />}
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
        signedIn={Boolean(session)}
        subtitles={episode.subtitles.map((subtitle) => ({
          lang: subtitle.lang,
          url: `/api/episodes/${episode.id}/subtitles/${subtitle.lang}`,
        }))}
      />
    </div>
  );
}
