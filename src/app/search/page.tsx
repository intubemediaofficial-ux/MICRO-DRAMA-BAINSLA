import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/server/db";
import { publicSeriesWhere } from "@/server/publishing";
import { buildMetadata } from "@/server/seo";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, webPageSchema } from "@/server/structured-data";
import { getSeoGlobal } from "@/server/site-config";
import SearchControls from "./search-controls";

export async function generateMetadata() {
  return buildMetadata({
    kind: "search",
    path: "/search",
    title: "Search stories",
    excerpt: "Find your next short drama.",
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; trope?: string; cast?: string }>;
}) {
  const params = await searchParams;
  const global = await getSeoGlobal();
  const q = params.q?.trim();
  const items = await prisma.series.findMany({
    where: {
      ...publicSeriesWhere,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { synopsis: { contains: q, mode: "insensitive" } },
              { castNames: { has: q } },
            ],
          }
        : {}),
      ...(params.genre ? { genres: { has: params.genre } } : {}),
      ...(params.trope ? { tropeTags: { has: params.trope } } : {}),
      ...(params.cast ? { castNames: { has: params.cast } } : {}),
    },
    orderBy: { title: "asc" },
  });
  return (
    <div className="p-5 pb-24">
      <JsonLd data={breadcrumbList([
        { name: global.siteName, url: "https://intubedrama.com/" },
        { name: "Search", url: "https://intubedrama.com/search" },
      ])} />
      <JsonLd data={webPageSchema({
        type: "WebPage",
        title: "Search stories",
        description: "Find your next short drama.",
        url: "https://intubedrama.com/search",
      })} />
      <Link href="/" className="text-zinc-400">
        ← Discover
      </Link>
      <h1 className="mt-7 text-3xl font-black">Find your next story</h1>
      <SearchControls q={q} genre={params.genre} trope={params.trope} cast={params.cast} />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => (
          <Link key={item.id} href={`/series/${item.slug}`} className="rounded-2xl bg-zinc-900 p-4">
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-zinc-800">
              <Image
                src={item.posterUrl}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 50vw, 240px"
                className="object-cover"
              />
            </div>
            <h2 className="mt-3 font-bold">{item.title}</h2>
            <p className="mt-1 text-xs text-zinc-500">{item.genres.join(" • ")}</p>
          </Link>
        ))}
      </div>
      {!items.length && <p className="mt-8 text-zinc-400">No stories match those filters.</p>}
    </div>
  );
}
