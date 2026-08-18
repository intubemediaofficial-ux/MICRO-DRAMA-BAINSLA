import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await prisma.series.findUnique({ where: { slug }, include: { episodes: { orderBy: { number: "asc" } } } });
  if (!series) notFound();
  return <div className="pb-24"><Link href="/" className="fixed left-4 top-4 z-10 rounded-full bg-black/50 px-4 py-2">←</Link><div className="h-72 bg-gradient-to-br from-rose-600/70 via-purple-900 to-zinc-950 p-6 pt-20"><p className="text-xs uppercase tracking-widest text-rose-200">{series.status}</p><h1 className="mt-2 text-4xl font-black">{series.title}</h1><p className="mt-2 max-w-xl text-sm text-zinc-200">{series.synopsis}</p></div><section className="p-5"><div className="flex flex-wrap gap-2 text-xs text-zinc-300">{series.genres.concat(series.tropeTags).map(tag => <span key={tag} className="rounded-full bg-zinc-800 px-3 py-1">#{tag}</span>)}</div><p className="mt-5 text-sm text-zinc-400">Cast: {series.castNames.join(", ")} · {series.episodes.length} episodes</p><h2 className="mt-8 mb-3 text-xl font-bold">Episodes</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{series.episodes.map(ep => <Link key={ep.id} href={`/watch/${ep.id}`} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-rose-500"><div className="flex items-center justify-between text-xs text-zinc-500"><span>EP {ep.number}</span><span>{ep.isFree || ep.number <= series.freeEpisodeCount ? "FREE" : `🪙 ${ep.coinPrice}`}</span></div><h3 className="mt-5 font-semibold">{ep.title}</h3><p className="mt-2 text-xs text-zinc-500">{Math.ceil(ep.durationSec / 60)} min</p></Link>)}</div></section></div>;
}
