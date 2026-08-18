import { PrismaClient } from "@prisma/client";
import catalogueManifest from "../public/demo/manifest.json";
import { isPlaceholderVideo } from "@/server/demo-media";
import { isPlaceholderThumbnail } from "@/server/media";
import { FfmpegVideoProcessor } from "@/server/video-processor";

const prisma = new PrismaClient();
const catalogueThumbnails = new Map(
  catalogueManifest.map((item) => [item.slug, item.thumbnailUrl]),
);

async function main() {
  const episodes = await prisma.episode.findMany({
    where: { thumbnailSource: { not: "CUSTOM" } },
    orderBy: [{ seriesId: "asc" }, { number: "asc" }],
  });
  const processor = new FfmpegVideoProcessor();
  let updated = 0;
  let skipped = 0;
  for (const episode of episodes) {
    if (!isPlaceholderThumbnail(episode.thumbnailUrl)) {
      skipped += 1;
      continue;
    }
    if (isPlaceholderVideo(episode.hlsPath)) {
      const series = await prisma.series.findUnique({
        where: { id: episode.seriesId },
        select: { slug: true },
      });
      const thumbnailUrl = series ? catalogueThumbnails.get(series.slug) : undefined;
      if (!thumbnailUrl) {
        console.log(`${episode.id}: skipped (placeholder video and no catalogue thumbnail)`);
        skipped += 1;
        continue;
      }
      await prisma.episode.update({
        where: { id: episode.id },
        data: {
          thumbnailUrl,
          thumbnailSource: "CATALOGUE",
          processingStatus: "READY",
          processingError: null,
        },
      });
      updated += 1;
      console.log(`${episode.id}: used catalogue thumbnail for placeholder video`);
      continue;
    }
    const thumbnailKey = `episodes/${episode.id}-backfill.jpg`;
    const result = await processor.process(episode.hlsPath, thumbnailKey);
    if (result.status === "FAILED") {
      await prisma.episode.update({
        where: { id: episode.id },
        data: { processingStatus: "FAILED", processingError: result.error },
      });
      console.log(`${episode.id}: failed - ${result.error}`);
      continue;
    }
    await prisma.episode.update({
      where: { id: episode.id },
      data: {
        thumbnailUrl: result.thumbnailUrl,
        thumbnailSource: "AUTO",
        durationSec: result.durationSec,
        processingStatus: "READY",
        processingError: null,
      },
    });
    updated += 1;
    console.log(`${episode.id}: generated thumbnail (${result.durationSec}s)`);
  }
  console.log(`backfill complete: updated ${updated}, skipped ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
