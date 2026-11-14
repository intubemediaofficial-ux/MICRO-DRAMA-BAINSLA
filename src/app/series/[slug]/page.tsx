import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth";
import { getSeriesDetail } from "@/server/series-detail";
import TeaserPlayer from "./teaser-player";
import SeasonEpisodes from "./season-episodes";

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const session = await getSession();
  const detail = await getSeriesDetail(slug, session?.userId ?? null);
  if (!detail) notFound();
  const { series, seasonGroups } = detail;
  return (
    <div className="pb-24">
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
