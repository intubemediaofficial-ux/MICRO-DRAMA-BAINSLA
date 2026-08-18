import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import WatchClient from "./watch-client";

export default async function WatchPage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      series: { include: { episodes: { orderBy: { number: "asc" } } } },
      subtitles: { select: { lang: true } },
    },
  });
  if (!episode) notFound();
  return (
    <div className="min-h-screen bg-black pb-16">
      <Link
        href={`/series/${episode.series.slug}`}
        className="fixed left-4 top-4 z-20 rounded-full bg-black/60 px-4 py-2"
      >
        ← {episode.series.title}
      </Link>
      <WatchClient
        episodeId={episode.id}
        title={episode.title}
        nextId={
          episode.series.episodes.find((item) => item.number === episode.number + 1)?.id ?? null
        }
        previousId={
          episode.series.episodes.find((item) => item.number === episode.number - 1)?.id ?? null
        }
        subtitles={episode.subtitles.map((subtitle) => ({
          lang: subtitle.lang,
          url: `/api/episodes/${episode.id}/subtitles/${subtitle.lang}`,
        }))}
      />
    </div>
  );
}
