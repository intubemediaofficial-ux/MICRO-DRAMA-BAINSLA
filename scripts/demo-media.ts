import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  EpisodeProcessingStatus,
  EpisodeThumbnailSource,
  PrismaClient,
} from "@prisma/client";
import { demoMedia, isPlaceholderVideo } from "@/server/demo-media";
import { isPlaceholderThumbnail, resolveMediaPath } from "@/server/media";
import { probeVideoDuration } from "@/server/video-processor";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();
const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

async function run(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${command} failed`;
    if (/ENOENT|not found/i.test(message)) {
      throw new Error(
        `${command} is not installed; install ffmpeg and ffprobe before generating media`,
      );
    }
    throw new Error(message.split("\n")[0] || `${command} failed`);
  }
}

async function ensureClip(slug: string, title: string) {
  const key = `demo/${slug}.mp4`;
  const output = resolveMediaPath(key);
  try {
    await fs.access(output);
    return key;
  } catch {
    await fs.mkdir(path.dirname(output), { recursive: true });
  }
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1080x1920:rate=30",
    "-t",
    "30",
    "-vf",
    `drawtext=fontfile=${font}:text='DEMO':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=180:box=1:boxcolor=black@0.65,drawtext=fontfile=${font}:text='${title}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h-260:box=1:boxcolor=black@0.65`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "32",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    "-y",
    output,
  ]);
  return key;
}

async function ensureThumbnail(videoKey: string, slug: string) {
  const key = `demo/${slug}.jpg`;
  const output = resolveMediaPath(key);
  try {
    await fs.access(output);
    return key;
  } catch {
    await fs.mkdir(path.dirname(output), { recursive: true });
  }
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "15",
    "-i",
    resolveMediaPath(videoKey),
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-y",
    output,
  ]);
  return key;
}

async function ensureHls(videoKey: string, slug: string) {
  const directory = resolveMediaPath(`demo/${slug}-hls`);
  const manifestKey = `demo/${slug}-hls/index.m3u8`;
  const manifest = resolveMediaPath(manifestKey);
  try {
    await fs.access(manifest);
    return manifestKey;
  } catch {
    await fs.mkdir(directory, { recursive: true });
  }
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    resolveMediaPath(videoKey),
    "-c",
    "copy",
    "-hls_time",
    "6",
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path.join(directory, "segment-%03d.ts"),
    "-f",
    "hls",
    manifest,
  ]);
  return manifestKey;
}

async function main() {
  const generated = new Map<
    string,
    { videoKey: string; thumbnailKey: string; hlsKey?: string; durationSec: number }
  >();
  for (const item of demoMedia) {
    const videoKey = await ensureClip(item.slug, item.title);
    const thumbnailKey = await ensureThumbnail(videoKey, item.slug);
    const hlsKey = item.hls ? await ensureHls(videoKey, item.slug) : undefined;
    generated.set(item.slug, {
      videoKey,
      thumbnailKey,
      hlsKey,
      durationSec: await probeVideoDuration(videoKey),
    });
  }

  for (const item of demoMedia) {
    const media = generated.get(item.slug);
    if (!media) continue;
    const series = await prisma.series.findUnique({
      where: { slug: item.slug },
      include: { episodes: { orderBy: { number: "asc" } } },
    });
    if (!series) {
      console.log(`${item.slug}: skipped (series not found)`);
      continue;
    }
    if (series.teaserUrl === "/media/sample.mp4") {
      await prisma.series.update({
        where: { id: series.id },
        data: { teaserUrl: `/media/${media.videoKey}` },
      });
    }
    if (series.episodes.length === 0) {
      console.log(`${item.slug}: skipped (no episode)`);
      continue;
    }
    let wiredEpisodes = 0;
    let updatedThumbnails = 0;
    for (const episode of series.episodes) {
      const data: {
        hlsPath?: string;
        durationSec?: number;
        thumbnailUrl?: string;
        thumbnailSource?: EpisodeThumbnailSource;
        processingStatus?: EpisodeProcessingStatus;
        processingError?: null;
      } = {};
      if (isPlaceholderVideo(episode.hlsPath)) {
        data.hlsPath = media.hlsKey ?? media.videoKey;
        data.durationSec = media.durationSec;
        data.processingStatus = EpisodeProcessingStatus.READY;
        data.processingError = null;
        wiredEpisodes += 1;
      }
      if (isPlaceholderThumbnail(episode.thumbnailUrl) && episode.thumbnailSource !== "CUSTOM") {
        data.thumbnailUrl = `/media/${media.thumbnailKey}`;
        data.thumbnailSource = EpisodeThumbnailSource.CATALOGUE;
        updatedThumbnails += 1;
      }
      if (Object.keys(data).length > 0) {
        await prisma.episode.update({ where: { id: episode.id }, data });
      }
    }
    console.log(
      `${item.slug}: wired ${wiredEpisodes} placeholder episodes, updated ${updatedThumbnails} thumbnails`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
