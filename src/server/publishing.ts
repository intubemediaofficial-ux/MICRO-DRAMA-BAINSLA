import { Prisma } from "@prisma/client";
import { PLACEHOLDER_VIDEO_PATHS } from "@/lib/publishing";
import { prisma } from "./db";

export const publicEpisodeWhere = {
  publishedAt: { not: null },
  processingStatus: "READY",
  hlsPath: { notIn: PLACEHOLDER_VIDEO_PATHS },
} satisfies Prisma.EpisodeWhereInput;

export function publicContentWhere(now = new Date()) {
  return {
    OR: [
      { status: "PUBLISHED" as const },
      { status: "SCHEDULED" as const, publishedAt: { lte: now } },
    ],
  };
}

export const publicSeriesWhere = {
  isPublished: true,
  episodes: { some: publicEpisodeWhere },
} satisfies Prisma.SeriesWhereInput;

export const publicSeriesSql = Prisma.sql`s."isPublished" = true AND EXISTS (SELECT 1 FROM "Episode" pe WHERE pe."seriesId" = s.id AND pe."publishedAt" IS NOT NULL AND pe."processingStatus" = 'READY' AND pe."hlsPath" NOT IN ('', 'sample.mp4'))`;

export async function findPublicEpisode(id: string) {
  return prisma.episode.findFirst({
    where: { id, ...publicEpisodeWhere, series: { isPublished: true } },
    include: { series: true, subtitles: { select: { lang: true, srtPath: true } } },
  });
}
