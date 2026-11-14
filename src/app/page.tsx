import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/server/auth";
import { getHomeFeed } from "@/server/home-curation";
import { continueWatching } from "@/server/watch-history";

export default async function HomePage() {
  const session = await getSession();
  const [{ heroItems, groups }, resumeItems] = await Promise.all([
    getHomeFeed(session?.userId),
    session ? continueWatching(session.userId) : Promise.resolve([]),
  ]);
  return (
    <div className="pb-20">
      <header className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-400">INTUBE DRAMA</p>
          <h1 className="text-2xl font-black">Your next obsession.</h1>
        </div>
        <Link
          href={session ? "/account/subscription" : "/login"}
          className="rounded-full bg-zinc-800 px-4 py-2 text-sm"
        >
          {session ? "My account" : "Sign in"}
        </Link>
      </header>
      {resumeItems.length > 0 ? (
        <section className="px-5 pb-5">
          <h2 className="mb-3 text-lg font-bold">Continue Watching</h2>
          <div className="hide-scrollbar flex gap-3 overflow-x-auto">
            {resumeItems.map((item) => (
              <Link
                href={`/watch/${item.episodeId}`}
                key={item.id}
                className="flex w-72 shrink-0 items-center gap-3 rounded-2xl bg-zinc-900 p-3"
              >
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                  <Image src={item.posterUrl} alt="" fill sizes="64px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">Episode {item.episodeNumber}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-700">
                    <div
                      className="h-full bg-rose-500"
                      style={{
                        width: `${item.durationSec > 0 ? Math.min(100, (item.positionSec / item.durationSec) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className="feed-snap hide-scrollbar flex h-[70vh] snap-y overflow-y-auto md:h-[620px]">
        {heroItems.map((item) => (
          <article
            key={item.id}
            className="relative min-w-full snap-start overflow-hidden rounded-3xl bg-zinc-900 md:min-w-[340px]"
          >
            <Image
              src={item.posterUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 340px"
              className="object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-7">
              <p className="mb-2 text-xs uppercase tracking-widest text-rose-200">
                {item.genres.join(" • ")}
              </p>
              <h2 className="max-w-sm text-4xl font-black">{item.title}</h2>
              <p className="mt-3 max-w-sm text-sm text-zinc-200">{item.synopsis}</p>
              <Link
                href={`/series/${item.slug}`}
                className="mt-5 w-fit rounded-full bg-white px-6 py-3 font-bold text-zinc-900"
              >
                Watch teaser ↗
              </Link>
              <span className="absolute right-3 top-1/2 text-xs text-zinc-300 [writing-mode:vertical-rl]">
                SWIPE FOR STORIES
              </span>
            </div>
          </article>
        ))}
        {!heroItems.length && (
          <div className="flex min-w-full items-center justify-center p-8 text-zinc-400">
            Run the seed command to load stories.
          </div>
        )}
      </section>
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{group.title}</h2>
                <span className="text-xs text-zinc-500">See all</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {group.items.map((item) => (
                  <Link
                    href={`/series/${item.slug}`}
                    key={item.id}
                    className="rounded-2xl bg-zinc-900 p-4 transition hover:bg-zinc-800"
                  >
                    <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-xl bg-zinc-800">
                      <Image
                        src={item.posterUrl}
                        alt={item.title}
                        fill
                        sizes="(max-width: 768px) 50vw, 240px"
                        className="object-cover"
                      />
                    </div>
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.episodes.length ? "Episodes ready" : "Coming soon"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
