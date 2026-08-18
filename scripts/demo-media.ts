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
const posterRoot = path.resolve("public/demo/posters");

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

function escapeFilterText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

async function findPoster(slug: string) {
  const poster = path.join(posterRoot, `${slug}.jpg`);
  try {
    const stat = await fs.stat(poster);
    return stat.isFile() ? poster : null;
  } catch {
    return null;
  }
}

async function ensureClip(slug: string, title: string, poster: string) {
  const key = `demo/${slug}.mp4`;
  const output = resolveMediaPath(key);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const escapedTitle = escapeFilterText(title);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    poster,
    "-t",
    "30",
    "-vf",
    [
      "scale=1080:1920",
      "zoompan=z='min(zoom+0.0004,1.12)':x='(iw-iw/zoom)/2*(1+sin(on/180))':y='(ih-ih/zoom)/2*(1+cos(on/220))':d=1:s=1080x1920:fps=30",
      "eq=brightness=-0.06:saturation=0.92",
      "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill",
      "vignette=PI/5",
      `drawtext=fontfile=${font}:text='${escapedTitle}':fontcolor=white:fontsize=68:x=(w-text_w)/2:y=h-340:box=1:boxcolor=black@0.45:boxborderw=24:enable='lt(t,4)'`,
      `drawtext=fontfile=${font}:text='DEMO':fontcolor=white@0.72:fontsize=28:x=w-text_w-48:y=48:box=1:boxcolor=black@0.28:boxborderw=8`,
    ].join(","),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "26",
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
  await fs.mkdir(path.dirname(output), { recursive: true });
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
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
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
    const poster = await findPoster(item.slug);
    if (!poster) {
      console.log(`${item.slug}: skipped (poster not found)`);
      continue;
    }
    const videoKey = await ensureClip(item.slug, item.title, poster);
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
