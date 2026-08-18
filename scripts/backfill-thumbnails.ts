import { PrismaClient } from "@prisma/client";
import { isPlaceholderThumbnail } from "@/server/media";
import { FfmpegVideoProcessor } from "@/server/video-processor";

const prisma = new PrismaClient();

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
    const extension = episode.hlsPath.endsWith(".m3u8")
      ? "mp4"
      : episode.hlsPath.split(".").pop() || "mp4";
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
    console.log(`${episode.id}: generated thumbnail (${extension}, ${result.durationSec}s)`);
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
