import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import SeriesEditor from "../series-editor";

export default async function EditSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return <div className="p-8"><h1 className="text-3xl font-black">Admin access required</h1><Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">Sign in</Link></div>;
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      castMembers: { orderBy: { sortOrder: "asc" } },
      episodes: { orderBy: { number: "asc" }, include: { subtitles: { select: { id: true, lang: true, srtPath: true } } } },
    },
  });
  if (!series) notFound();
  return <div><Link href="/admin/series" className="text-sm text-zinc-400 hover:text-white">← Series library</Link><h1 className="mt-5 text-3xl font-black">{series.title}</h1><p className="mt-2 text-sm text-zinc-400">Edit metadata, media, cast, episodes and subtitles.</p><SeriesEditor initial={series} /></div>;
}
