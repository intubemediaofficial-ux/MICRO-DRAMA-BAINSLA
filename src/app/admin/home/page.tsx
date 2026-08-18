import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import HomeCurationClient from "./home-curation-client";

export default async function AdminHomePage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-black">Admin access required</h1>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">Sign in</Link>
      </div>
    );
  }
  const [series, items] = await Promise.all([
    prisma.series.findMany({
      where: { isPublished: true },
      orderBy: { title: "asc" },
      select: { id: true, slug: true, title: true, posterUrl: true },
    }),
    prisma.homeRailItem.findMany({
      orderBy: [{ railKey: "asc" }, { position: "asc" }],
      select: { id: true, railKey: true, position: true, seriesId: true, bannerUrl: true },
    }),
  ]);
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Merchandising</p>
      <h1 className="mt-2 text-3xl font-black">Home curation</h1>
      <p className="mt-2 text-sm text-zinc-400">Choose the stories and order viewers see on each home rail.</p>
      <HomeCurationClient
        series={series}
        initialItems={items.map((item) => ({
          ...item,
          railKey: item.railKey as "hero-1" | "hero-2" | "hero-3" | "for-you" | "trending" | "new-releases",
        }))}
        banners={[
          "/demo/banners/banner-tonight.jpg",
          "/demo/banners/banner-trial.jpg",
          "/demo/banners/banner-double-coins.jpg",
        ]}
      />
    </div>
  );
}
