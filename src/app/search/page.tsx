import Link from "next/link";
import { prisma } from "@/server/db";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; genre?: string; trope?: string }> }) {
  const params = await searchParams; const q = params.q?.trim();
  const all = await prisma.series.findMany({ where: { isPublished: true }, orderBy: { title: "asc" } });
  const items = all.filter(item => (!q || [item.title, item.synopsis, ...item.castNames].join(" ").toLowerCase().includes(q.toLowerCase())) && (!params.genre || item.genres.includes(params.genre)) && (!params.trope || item.tropeTags.includes(params.trope)));
  return <div className="p-5 pb-24"><Link href="/" className="text-zinc-400">← Discover</Link><h1 className="mt-7 text-3xl font-black">Find your next story</h1><form className="mt-5 flex gap-2"><input name="q" defaultValue={q} placeholder="Search title, cast…" className="min-w-0 flex-1 rounded-xl bg-zinc-900 p-4" /><button className="rounded-xl bg-rose-500 px-5 font-bold">Search</button></form><div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">{items.map(item => <Link key={item.id} href={`/series/${item.slug}`} className="rounded-2xl bg-zinc-900 p-4"><div className="aspect-[3/4] rounded-xl bg-gradient-to-br from-purple-500/70 to-zinc-950" /><h2 className="mt-3 font-bold">{item.title}</h2><p className="mt-1 text-xs text-zinc-500">{item.genres.join(" • ")}</p></Link>)}</div>{!items.length && <p className="mt-8 text-zinc-400">No stories match those filters.</p>}</div>;
}
