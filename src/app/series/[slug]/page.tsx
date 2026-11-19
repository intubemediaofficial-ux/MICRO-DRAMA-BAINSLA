import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Route } from "next";
import { getSession } from "@/server/auth";
import { resolveRedirect } from "@/server/cms";
import { prisma } from "@/server/db";
import { getSeriesDetail } from "@/server/series-detail";
import { SeoFieldsSchema } from "@/lib/seo";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { getSeoGlobal } from "@/server/site-config";
import { articleSchema, breadcrumbList, faqPageSchema, schemaTypeFor, tvSeriesSchema } from "@/server/structured-data";
import { JsonLd } from "@/components/json-ld";
import WatchlistToggle from "../watchlist-toggle";
import ShareButton from "../share-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const detail = await getSeriesDetail(slug, null);
  if (!detail) return {};
  const { series } = detail;
  return buildMetadata({
    kind: "series",
    path: `/series/${encodeURIComponent(series.slug)}`,
    title: series.title,
    excerpt: series.synopsis,
    image: series.posterUrl,
    seo: series.seo,
    vars: { series: series.title },
  });
}
import TeaserPlayer from "./teaser-player";
import SeasonEpisodes from "./season-episodes";

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const session = await getSession();
  const detail = await getSeriesDetail(slug, session?.userId ?? null);
  if (!detail) {
    const target = await resolveRedirect(`/series/${slug}`).catch(() => null);
    if (target) {
      if (target.permanent) permanentRedirect(target.toPath as Route);
      redirect(target.toPath as Route);
    }
    notFound();
  }
  const { series, seasonGroups } = detail;
  const [global] = await Promise.all([getSeoGlobal()]);
  const seoResult = SeoFieldsSchema.safeParse(series.seo);
  const seo = seoResult.success ? seoResult.data : {};
  const schemaType = schemaTypeFor("series", seo.schemaType);
  const seriesUrl = `${SITE_ORIGIN}/series/${encodeURIComponent(series.slug)}`;
  const breadcrumbs = breadcrumbList([
    { name: global.siteName, url: `${SITE_ORIGIN}/` },
    { name: seo.breadcrumbTitle || series.title, url: seriesUrl },
  ]);
  const description = seo.description || series.synopsis;
  const entitySchema = schemaType === "None"
    ? null
    : schemaType === "FAQPage" && seo.faq?.length
      ? faqPageSchema(seo.faq)
      : schemaType === "Article" || schemaType === "BlogPosting" || schemaType === "NewsArticle"
        ? articleSchema({
            type: schemaType,
            title: series.title,
            description,
            url: seriesUrl,
            image: series.posterUrl,
            organizationName: global.organization.name,
            organizationLogo: global.organization.logo || undefined,
          })
        : tvSeriesSchema({
            name: series.title,
            description,
            url: seriesUrl,
            image: series.posterUrl,
            genres: series.genres,
            actors: series.castMembers.map((member) => member.name),
            episodeCount: series.episodes.length,
          });
  const inWatchlist = session
    ? Boolean(
        await prisma.watchlistItem.findUnique({
          where: { userId_seriesId: { userId: session.userId, seriesId: series.id } },
          select: { id: true },
        }),
      )
    : false;
  return (
    <div className="pb-24">
      <JsonLd data={breadcrumbs} />
      {entitySchema && <JsonLd data={entitySchema} />}
      <Link href="/" className="fixed left-4 top-4 z-10 rounded-full bg-black/50 px-4 py-2">
        ←
      </Link>
      <div className="relative h-72 overflow-hidden bg-zinc-900 p-6 pt-20">
        <TeaserPlayer src={series.teaserUrl} poster={series.posterUrl} title={series.title} />
        <Image
          src={series.posterUrl}
          alt=""
          fill
          sizes="100vw"
          className="z-0 object-cover opacity-50"
        />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="relative z-30">
          <p className="text-xs uppercase tracking-widest text-rose-200">{series.status}</p>
          <h1 className="mt-2 text-4xl font-black">{series.title}</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-200">{series.synopsis}</p>
        </div>
      </div>
      <section className="p-5">
        <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
          {series.genres.concat(series.tropeTags).map((tag) => (
            <span key={tag} className="rounded-full bg-zinc-800 px-3 py-1">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <WatchlistToggle
            seriesId={series.id}
            initialInWatchlist={inWatchlist}
            signedIn={Boolean(session)}
          />
          <ShareButton
            title={series.title}
            url={`${SITE_ORIGIN}/series/${encodeURIComponent(series.slug)}`}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-400">
          {(series.castMembers.length
            ? series.castMembers
            : series.castNames.map((name) => ({ id: name, name, role: null, photo: null }))
          ).map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-2"
            >
              {member.photo && (
                <Image
                  src={member.photo}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover"
                />
              )}
              <span>
                {member.name}
                {member.role ? ` · ${member.role}` : ""}
              </span>
            </div>
          ))}
          <span className="self-center">· {series.episodes.length} episodes</span>
        </div>
        <h2 className="mt-8 mb-3 text-xl font-bold">Episodes</h2>
        <SeasonEpisodes freeEpisodeCount={series.freeEpisodeCount} seasons={seasonGroups} />
      </section>
    </div>
  );
}
