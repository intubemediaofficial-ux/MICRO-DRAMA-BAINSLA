import { PrismaClient } from "@prisma/client";
import { transcodeToHls } from "@/server/video-processor";

const prisma = new PrismaClient();

/** Converts every MP4 episode source into the HLS ladder once and repoints its episodes. */
async function main() {
  const sources = await prisma.episode.findMany({
    where: { hlsPath: { endsWith: ".mp4" } },
    distinct: ["hlsPath"],
    select: { hlsPath: true },
  });
  for (const { hlsPath } of sources) {
    const started = Date.now();
    try {
      const master = await transcodeToHls(hlsPath);
      const { count } = await prisma.episode.updateMany({
        where: { hlsPath },
        data: { hlsPath: master },
      });
      console.log(`ok ${hlsPath} -> ${master} (${count} episodes, ${Date.now() - started}ms)`);
    } catch (error) {
      console.log(`fail ${hlsPath}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
