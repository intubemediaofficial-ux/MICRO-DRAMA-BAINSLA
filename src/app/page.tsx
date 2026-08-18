import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/server/auth";
import { getDiscovery } from "@/server/discovery";
import { getHomeCuration } from "@/server/home-curation";

export default async function HomePage() {
  const session = await getSession();
  const [discovery, curated] = await Promise.all([
    getDiscovery(session?.userId),
    getHomeCuration(),
  ]);
  const curatedRail = (railKey: string) =>
    curated
      .filter((item) => item.railKey === railKey && item.series)
      .map((item) => item.series)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const hero = ["hero-1", "hero-2", "hero-3"].flatMap(curatedRail);
  const heroItems = hero.length ? hero : discovery.trending;
  const forYou = curatedRail("for-you");
  const trending = curatedRail("trending");
  const newReleases = curatedRail("new-releases");
  const groups = [
    { title: "For You", items: forYou.length ? forYou : discovery.forYou },
    { title: "Trending Today", items: trending.length ? trending : discovery.trending },
    { title: "New Releases", items: newReleases.length ? newReleases : discovery.newReleases },
    ...discovery.genreRows.map((row) => ({ title: `Genre: ${row.title}`, items: row.items })),
    ...discovery.tropeRows.map((row) => ({ title: `Trope: ${row.title}`, items: row.items })),
  ];
  return (
    <div className="pb-20">
      <header className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-400">MICRODRAMA</p>
          <h1 className="text-2xl font-black">Your next obsession.</h1>
        </div>
        <Link href="/login" className="rounded-full bg-zinc-800 px-4 py-2 text-sm">
          Sign in
        </Link>
      </header>
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
        {!discovery.trending.length && (
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
