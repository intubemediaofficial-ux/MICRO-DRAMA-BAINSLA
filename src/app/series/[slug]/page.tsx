import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveEpisodeEntitlement } from "@/server/entitlements";
import { getWatchedEpisodeIds } from "@/server/discovery";
import TeaserPlayer from "./teaser-player";

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const series = await prisma.series.findUnique({
    where: { slug },
    include: {
      episodes: { orderBy: { number: "asc" } },
      castMembers: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!series) notFound();
  const entitlements = session
    ? await Promise.all(
        series.episodes.map((episode) => resolveEpisodeEntitlement(session.userId, episode.id)),
      )
    : series.episodes.map(() => ({ entitled: false, reason: "LOCKED" as const }));
  const watchedIds = session
    ? await getWatchedEpisodeIds(
        session.userId,
        series.episodes.map((episode) => episode.id),
      )
    : new Set<string>();
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {series.episodes.map((ep, index) => (
            <Link
              key={ep.id}
              href={`/watch/${ep.id}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-rose-500"
            >
              <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-zinc-800">
                <Image
                  src={ep.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 180px"
                  className="object-cover"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>EP {ep.number}</span>
                <span className="flex items-center gap-1">
                  {watchedIds.has(ep.id) && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-300">
                      WATCHED
                    </span>
                  )}
                  <span>
                    {ep.isFree || ep.number <= series.freeEpisodeCount
                      ? "FREE"
                      : entitlements[index]?.reason === "SUBSCRIPTION"
                        ? "VIP"
                        : `🪙 ${ep.coinPrice}`}
                  </span>
                </span>
              </div>
              <h3 className="mt-5 font-semibold">{ep.title}</h3>
              <p className="mt-2 text-xs text-zinc-500">{Math.ceil(ep.durationSec / 60)} min</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
