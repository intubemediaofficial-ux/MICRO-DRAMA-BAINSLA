import { prisma } from "./db";
import { hasPlayableVideo } from "@/lib/publishing";
import { publicEpisodeWhere } from "./publishing";

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
    const episode = row.episode;
    const available =
      episode.series.isPublished && episode.publishedAt !== null && hasPlayableVideo(episode);
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
  const row = await prisma.watchProgress.findUnique({
    where: {
      userId_episodeId: {
        userId,
        episodeId,
      },
    },
    select: {
      positionSec: true,
      completed: true,
    },
  });
  return row ? resumePosition(row.positionSec, durationSec, row.completed) : 0;
}

export async function continueWatching(userId: string, limit = 10) {
  const rows = await prisma.watchProgress.findMany({
    where: {
      userId,
      episode: { ...publicEpisodeWhere, series: { isPublished: true } },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      updatedAt: true,
      positionSec: true,
      completed: true,
      episode: {
        select: {
          id: true,
          number: true,
          durationSec: true,
          series: {
            select: {
              id: true,
              slug: true,
              title: true,
              synopsis: true,
              posterUrl: true,
              genres: true,
              episodes: {
                where: publicEpisodeWhere,
                orderBy: { number: "asc" },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  const latestBySeries = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestBySeries.has(row.episode.series.id))
      latestBySeries.set(row.episode.series.id, row);
  }

  const result = [];
  for (const row of latestBySeries.values()) {
    let episodeId = row.episode.id;
    let episodeNumber = row.episode.number;
    let durationSec = row.episode.durationSec;
    let positionSec = row.completed ? 0 : row.positionSec;
    if (row.completed) {
      const next = await prisma.episode.findFirst({
        where: {
          seriesId: row.episode.series.id,
          number: { gt: row.episode.number },
          ...publicEpisodeWhere,
        },
        orderBy: { number: "asc" },
        select: { id: true, number: true, durationSec: true },
      });
      if (!next) continue;
      episodeId = next.id;
      episodeNumber = next.number;
      durationSec = next.durationSec;
    }
    result.push({
      id: row.episode.series.id,
      slug: row.episode.series.slug,
      title: row.episode.series.title,
      synopsis: row.episode.series.synopsis,
      posterUrl: row.episode.series.posterUrl,
      genres: row.episode.series.genres,
      firstEpisodeId: row.episode.series.episodes[0]?.id ?? null,
      episodeId,
      episodeNumber,
      positionSec,
      durationSec,
    });
    if (result.length >= Math.max(0, limit)) break;
  }
  return result;
}
