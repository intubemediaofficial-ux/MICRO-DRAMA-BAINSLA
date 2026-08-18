import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const WATCH_HISTORY_LIMIT = 50;
const WATCH_HISTORY_SCAN_LIMIT = 100;

export type ProgressHistoryRow = {
  id: string;
  userId: string;
  episodeId: string;
  positionSec: number;
  completed: boolean;
  updatedAt: Date;
};

export function collapseLatestProgress<T extends ProgressHistoryRow>(rows: T[]): T[] {
  const latestByEpisode = new Map<string, T>();
  for (const row of rows) {
    const existing = latestByEpisode.get(row.episodeId);
    if (!existing || row.updatedAt > existing.updatedAt) latestByEpisode.set(row.episodeId, row);
  }
  return [...latestByEpisode.values()].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
}

export function progressPercentage(
  positionSec: number,
  durationSec: number,
  completed = false,
): number {
  if (completed) return 100;
  if (durationSec <= 0) return 0;
  if (positionSec >= durationSec) return 100;
  return Math.max(0, Math.min(100, Math.round((positionSec / durationSec) * 100)));
}

export function resumePosition(
  positionSec: number,
  durationSec: number,
  completed = false,
): number {
  if (completed || durationSec <= 0 || positionSec >= durationSec) return 0;
  return Math.max(0, Math.min(positionSec, Math.max(0, durationSec - 1)));
}

export function formatTimeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

type ProgressWithEpisode = Prisma.WatchProgressGetPayload<{
  include: {
    episode: {
      include: {
        series: true;
        season: true;
      };
    };
  };
}>;

export type WatchHistoryItem = {
  id: string;
  episodeId: string;
  seriesTitle: string;
  seriesSlug: string;
  seriesPublished: boolean;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  thumbnailUrl: string;
  durationSec: number;
  positionSec: number;
  completed: boolean;
  percentage: number;
  updatedAt: Date;
  available: boolean;
};

export async function getWatchHistory(userId: string): Promise<WatchHistoryItem[]> {
  const rows = await prisma.watchProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: WATCH_HISTORY_SCAN_LIMIT,
    include: {
      episode: {
        include: {
          series: true,
          season: true,
        },
      },
    },
  });
  const latest = collapseLatestProgress(rows);
  return latest.slice(0, WATCH_HISTORY_LIMIT).map((row) => {
    const episode = (row as ProgressWithEpisode).episode;
    const available = episode.series.isPublished && episode.publishedAt !== null;
    return {
      id: row.id,
      episodeId: row.episodeId,
      seriesTitle: episode.series.title,
      seriesSlug: episode.series.slug,
      seriesPublished: episode.series.isPublished,
      seasonNumber: episode.season?.number ?? 1,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      thumbnailUrl: episode.thumbnailUrl || episode.series.posterUrl,
      durationSec: episode.durationSec,
      positionSec: row.positionSec,
      completed: row.completed,
      percentage: progressPercentage(row.positionSec, episode.durationSec, row.completed),
      updatedAt: row.updatedAt,
      available,
    };
  });
}

export async function getResumePositionForEpisode(
  userId: string,
  episodeId: string,
  durationSec: number,
): Promise<number> {
  const rows = await prisma.watchProgress.findMany({
    where: { userId, episodeId },
    orderBy: { updatedAt: "desc" },
    take: WATCH_HISTORY_SCAN_LIMIT,
    select: {
      id: true,
      userId: true,
      episodeId: true,
      positionSec: true,
      completed: true,
      updatedAt: true,
    },
  });
  const latest = collapseLatestProgress(rows)[0];
  return latest ? resumePosition(latest.positionSec, durationSec, latest.completed) : 0;
}
