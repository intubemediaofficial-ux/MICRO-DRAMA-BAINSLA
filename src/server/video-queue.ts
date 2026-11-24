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
const rerun = new Set<string>();

async function markFailed(episodeId: string, sourceKey: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Video processing failed";
  await prisma.episode.updateMany({
    where: { id: episodeId, processingStatus: "PROCESSING", sourceKey },
    data: {
      processingStatus: "FAILED",
      processingError: message.slice(0, 1000),
      publishOnReady: false,
      publishedAt: null,
    },
  });
}

async function findEpisodeForProcessing(episodeId: string) {
  return prisma.episode.findUnique({
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
}

type EpisodeForProcessing = Awaited<ReturnType<typeof findEpisodeForProcessing>>;

async function processLoadedEpisode(existing: EpisodeForProcessing) {
  if (!existing?.sourceKey || existing.processingStatus !== "PROCESSING") return;

  const thumbnailKey = `${existing.sourceKey.replace(/\.[^.]+$/, "")}.jpg`;
  const processed = await new FfmpegVideoProcessor().process(existing.sourceKey, thumbnailKey);
  if (processed.status === "FAILED") {
    await prisma.episode.updateMany({
      where: {
        id: existing.id,
        processingStatus: "PROCESSING",
        sourceKey: existing.sourceKey,
      },
      data: {
        processingStatus: "FAILED",
        processingError: processed.error,
        publishedAt: null,
        publishOnReady: false,
      },
    });
    return;
  }

  const latest = await prisma.episode.findUnique({
    where: { id: existing.id },
    select: {
      sourceKey: true,
      processingStatus: true,
      sku: true,
      thumbnailSource: true,
      publishedAt: true,
      publishOnReady: true,
    },
  });
  if (
    !latest ||
    latest.sourceKey !== existing.sourceKey ||
    latest.processingStatus !== "PROCESSING"
  )
    return;

  const justPublished = Boolean(
    latest.publishOnReady &&
      latest.publishedAt === null &&
      hasPlayableVideo({ ...processed, processingStatus: "READY" }),
  );
  const publishedAt = justPublished ? new Date() : latest.publishedAt;
  const updated = await prisma.episode.updateMany({
    where: {
      id: existing.id,
      processingStatus: "PROCESSING",
      sourceKey: existing.sourceKey,
    },
    data: {
      hlsPath: processed.hlsPath,
      ...buildEpisodeUploadMetadata({
        originalFilename:
          existing.originalFilename ?? existing.sourceKey.split("/").pop() ?? "video.mp4",
        durationSec: processed.durationSec,
        sku: latest.sku,
      }),
      processingStatus: "READY",
      processingError: null,
      ...thumbnailPersistence(latest.thumbnailSource, processed.thumbnailUrl),
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

  let seriesPublished = existing.series.isPublished;
  if (justPublished && existing.series.publishOnFirstReady) {
    const publishedSeries = await prisma.series.updateMany({
      where: { id: existing.series.id, publishOnFirstReady: true },
      data: { isPublished: true, publishOnFirstReady: false },
    });
    seriesPublished ||= publishedSeries.count > 0;
  }
  if (justPublished && seriesPublished)
    void notifyNewPublicEpisode(existing.id).catch(() => {});
}

export async function processEpisodeVideo(episodeId: string) {
  await processLoadedEpisode(await findEpisodeForProcessing(episodeId));
}

async function run(episodeId: string) {
  let sourceKey: string | null = null;
  try {
    const existing = await findEpisodeForProcessing(episodeId);
    sourceKey = existing?.sourceKey ?? null;
    await processLoadedEpisode(existing);
  } catch (error) {
    if (sourceKey) {
      try {
        await markFailed(episodeId, sourceKey, error);
      } catch {
        return;
      }
    }
  } finally {
    running.delete(episodeId);
    if (rerun.delete(episodeId)) {
      pending.push(episodeId);
      queued.add(episodeId);
    }
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
  if (queued.has(episodeId)) return false;
  if (running.has(episodeId)) {
    rerun.add(episodeId);
    return false;
  }
  pending.push(episodeId);
  queued.add(episodeId);
  pump();
  return true;
}
