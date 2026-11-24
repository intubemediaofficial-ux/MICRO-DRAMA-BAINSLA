import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import QuickUploadClient from "./quick-upload-client";

export default async function QuickUploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return (
      <div className="p-8">
        <h1 className="text-3xl font-black">Admin access required</h1>
        <Link
          href={`/login?returnTo=${encodeURIComponent("/admin/upload")}`}
          className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3"
        >
          Sign in
        </Link>
      </div>
    );

  const [series, params] = await Promise.all([
    prisma.series.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        defaultCoinPrice: true,
        freeEpisodeCount: true,
        isPublished: true,
        genres: true,
      },
    }),
    searchParams,
  ]);
  return (
    <QuickUploadClient
      series={series}
      initialSeriesId={typeof params.seriesId === "string" ? params.seriesId : ""}
    />
  );
}
