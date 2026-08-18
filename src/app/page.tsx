import Link from "next/link";
import { prisma } from "@/server/db";

export default async function HomePage() {
  const series = await prisma.series.findMany({ where: { isPublished: true }, include: { episodes: { orderBy: { number: "asc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
  const groups = [
    { title: "Trending Today", items: series.slice(0, 4) },
    { title: "New Releases", items: series.slice().reverse() },
    { title: "Because you love cliffhangers", items: series.filter(item => item.tropeTags.includes("cliffhanger")) }
  ];
  return <div className="pb-20">
    <header className="flex items-center justify-between p-5"><div><p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-400">MICRODRAMA</p><h1 className="text-2xl font-black">Your next obsession.</h1></div><Link href="/login" className="rounded-full bg-zinc-800 px-4 py-2 text-sm">Sign in</Link></header>
    <section className="feed-snap hide-scrollbar flex h-[70vh] snap-y overflow-y-auto md:h-[620px]">
      {series.slice(0, 4).map(item => <article key={item.id} className="relative min-w-full snap-start overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-800 to-rose-950 p-7 md:min-w-[340px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,#fb7185,transparent_35%)] opacity-40" /><div className="relative flex h-full flex-col justify-end"><p className="mb-2 text-xs uppercase tracking-widest text-rose-200">{item.genres.join(" • ")}</p><h2 className="max-w-sm text-4xl font-black">{item.title}</h2><p className="mt-3 max-w-sm text-sm text-zinc-200">{item.synopsis}</p><Link href={`/series/${item.slug}`} className="mt-5 w-fit rounded-full bg-white px-6 py-3 font-bold text-zinc-900">Watch teaser ↗</Link><span className="absolute right-3 top-1/2 text-xs text-zinc-300 [writing-mode:vertical-rl]">SWIPE FOR STORIES</span></div>
      </article>)}
      {series.length === 0 && <div className="flex min-w-full items-center justify-center p-8 text-zinc-400">Run the seed command to load stories.</div>}
    </section>
    {groups.map(group => <section key={group.title} className="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{group.title}</h2><span className="text-xs text-zinc-500">See all</span></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{group.items.map(item => <Link href={`/series/${item.slug}`} key={item.id} className="rounded-2xl bg-zinc-900 p-4 transition hover:bg-zinc-800"><div className="mb-3 aspect-[3/4] rounded-xl bg-gradient-to-br from-rose-500/70 via-purple-900 to-zinc-900" /><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-xs text-zinc-500">{item.episodes.length ? "Episodes ready" : "Coming soon"}</p></Link>)}</div></section>)}
  </div>;
}
