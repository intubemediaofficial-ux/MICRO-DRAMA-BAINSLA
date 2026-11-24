import { hasPlayableVideo } from "@/lib/publishing";
import { prisma } from "@/server/db";
import { notifyNewPublicEpisode } from "@/server/episode-notifications";
import { buildEpisodeUploadMetadata } from "@/server/episode-validation";
import { FfmpegVideoProcessor, thumbnailPersistence } from "@/server/video-processor";

const configuredConcurrency = Number(process.env.VIDEO_PROCESS_CONCURRENCY ?? 1);
const concurrency =
  Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.max(1, Math.floor(configuredConcurrency))
    : 1;
const pending: string[] = [];
const queued = new Set<string>();
const running = new Set<string>();

async function markFailed(episodeId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Video processing failed";
  await prisma.episode.updateMany({
    where: { id: episodeId, processingStatus: "PROCESSING" },
    data: {
      processingStatus: "FAILED",
      processingError: message.slice(0, 1000),
      publishOnReady: false,
      publishedAt: null,
    },
  });
}

export async function processEpisodeVideo(episodeId: string) {
  const existing = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: {
      series: {
        select: {
          id: true,
          isPublished: true,
          posterUrl: true,
          publishOnFirstReady: true,
        },
      },
    },
  });
  if (!existing?.sourceKey) return;

  const thumbnailKey = `${existing.sourceKey.replace(/\.[^.]+$/, "")}.jpg`;
  const processed = await new FfmpegVideoProcessor().process(existing.sourceKey, thumbnailKey);
  if (processed.status === "FAILED") {
    await prisma.episode.updateMany({
      where: { id: episodeId, processingStatus: "PROCESSING" },
      data: {
        processingStatus: "FAILED",
        processingError: processed.error,
        publishedAt: null,
        publishOnReady: false,
      },
    });
    return;
  }

  const publishedAt =
    existing.publishOnReady && hasPlayableVideo({ ...processed, processingStatus: "READY" })
      ? new Date()
      : existing.publishedAt;
  const updated = await prisma.episode.updateMany({
    where: { id: episodeId, processingStatus: "PROCESSING" },
    data: {
      hlsPath: processed.hlsPath,
      ...buildEpisodeUploadMetadata({
        originalFilename:
          existing.originalFilename ?? existing.sourceKey.split("/").pop() ?? "video.mp4",
        durationSec: processed.durationSec,
        sku: existing.sku,
      }),
      processingStatus: "READY",
      processingError: null,
      ...thumbnailPersistence(existing.thumbnailSource, processed.thumbnailUrl),
      publishedAt,
      publishOnReady: false,
    },
  });
  if (!updated.count) return;

  if (!existing.series.posterUrl) {
    await prisma.series.updateMany({
      where: { id: existing.series.id, posterUrl: "" },
      data: { posterUrl: processed.thumbnailUrl },
    });
  }

  const justPublished = Boolean(existing.publishOnReady && publishedAt);
  let seriesPublished = existing.series.isPublished;
  if (justPublished && existing.series.publishOnFirstReady) {
    const publishedSeries = await prisma.series.updateMany({
      where: { id: existing.series.id, publishOnFirstReady: true },
      data: { isPublished: true, publishOnFirstReady: false },
    });
    seriesPublished ||= publishedSeries.count > 0;
  }
  if (justPublished && seriesPublished)
    void notifyNewPublicEpisode(episodeId).catch(() => {});
}

async function run(episodeId: string) {
  try {
    await processEpisodeVideo(episodeId);
  } catch (error) {
    try {
      await markFailed(episodeId, error);
    } catch {
      return;
    }
  } finally {
    running.delete(episodeId);
    pump();
  }
}

function pump() {
  while (running.size < concurrency && pending.length) {
    const episodeId = pending.shift();
    if (!episodeId) return;
    queued.delete(episodeId);
    running.add(episodeId);
    void run(episodeId);
  }
}

export function enqueueEpisodeVideo(episodeId: string) {
  if (queued.has(episodeId) || running.has(episodeId)) return false;
  pending.push(episodeId);
  queued.add(episodeId);
  pump();
  return true;
}
