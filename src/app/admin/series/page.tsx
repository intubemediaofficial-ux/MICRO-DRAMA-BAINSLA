import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import SeriesListClient from "./series-list-client";

export default async function AdminSeriesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-black">Admin access required</h1>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  }
  const series = await prisma.series.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      synopsis: true,
      posterUrl: true,
      status: true,
      isPublished: true,
      freeEpisodeCount: true,
      defaultCoinPrice: true,
      episodes: { select: { isFree: true } },
    },
  });
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Content</p>
      <h1 className="mt-2 text-3xl font-black">Series library</h1>
      <p className="mt-2 text-sm text-zinc-400">See publishing state, pricing and free episodes at a glance.</p>
      <SeriesListClient initial={series} />
    </div>
  );
}
