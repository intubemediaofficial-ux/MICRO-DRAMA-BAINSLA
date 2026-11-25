import { prisma } from "@/server/db";
import { enqueueEpisodeVideo } from "@/server/video-queue";

export async function register() {
  const processing = await prisma.episode.findMany({
    where: { processingStatus: "PROCESSING", sourceKey: { not: null } },
    select: { id: true },
  });
  for (const episode of processing) enqueueEpisodeVideo(episode.id);
}
