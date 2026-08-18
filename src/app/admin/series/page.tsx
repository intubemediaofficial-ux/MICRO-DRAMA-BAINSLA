import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import AdminCmsClient from "./cms-client";

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
  const [series, banners] = await Promise.all([
    prisma.series.findMany({
      include: {
        episodes: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            title: true,
            durationSec: true,
            hlsPath: true,
            thumbnailUrl: true,
            publishedAt: true,
            isFree: true,
            coinPrice: true,
            subtitles: { select: { lang: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="p-5 pb-24">
      <Link href="/admin" className="text-zinc-400">
        ← CMS
      </Link>
      <h1 className="mt-7 text-3xl font-black">Catalogue management</h1>
      <AdminCmsClient series={series} banners={banners} />
    </div>
  );
}
