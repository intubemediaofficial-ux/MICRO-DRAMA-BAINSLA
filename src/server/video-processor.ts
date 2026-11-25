import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveMediaPath } from "./media";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 45_000;

export type VideoProcessingResult =
  | {
      status: "READY";
      hlsPath: string;
      thumbnailUrl: string;
      durationSec: number;
    }
  | {
      status: "FAILED";
      error: string;
    };

export interface VideoProcessor {
  process(inputKey: string, thumbnailKey: string): Promise<VideoProcessingResult>;
}

export function selectThumbnailTimestamp(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (durationSec < 10) return Math.max(0, durationSec / 2);
  const latestSafeTimestamp = durationSec - 0.5;
  const preferredTimestamp = Math.min(15, Math.max(10, latestSafeTimestamp));
  return Math.min(preferredTimestamp, latestSafeTimestamp);
}

export function parseDuration(value: string) {
  const duration = Number.parseFloat(value.trim());
  return Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration)) : null;
}

export function shouldReplaceThumbnail(thumbnailSource: string | null | undefined) {
  return thumbnailSource !== "CUSTOM";
}

export function thumbnailPersistence(
  thumbnailSource: string | null | undefined,
  thumbnailUrl: string,
) {
  return shouldReplaceThumbnail(thumbnailSource)
    ? { thumbnailUrl, thumbnailSource: "AUTO" as const }
    : {};
}

export async function run(command: string, args: string[], timeout = DEFAULT_TIMEOUT_MS) {
  try {
    return await execFileAsync(command, args, {
      timeout,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${command} failed`;
    if (/ENOENT|not found/i.test(message)) {
      throw new Error(`${command} is not installed on the server`);
    }
    if (/timed out|killed/i.test(message)) throw new Error(`${command} timed out`);
    throw new Error(message.split("\n")[0] || `${command} failed`);
  }
}

const HLS_LADDER = [
  { shortSide: 360, maxrate: "600k", bufsize: "1200k" },
  { shortSide: 540, maxrate: "1200k", bufsize: "2400k" },
  { shortSide: 720, maxrate: "2200k", bufsize: "4400k" },
];
const HLS_TIMEOUT_MS = 20 * 60_000;

export function hlsKeyFor(inputKey: string, version?: string) {
  const suffix = version ? `-hls-${version}` : "-hls";
  return `${inputKey.replace(/\.[^./]+$/, "")}${suffix}/master.m3u8`;
}

async function hasAudio(inputKey: string) {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    resolveMediaPath(inputKey),
  ]);
  return result.stdout.trim().length > 0;
}

/**
 * Transcodes to a 360/540/720 HLS ladder with 2s segments for fast start and adaptive bitrate.
 * Each run writes a fresh directory so a ladder that is still being served is never deleted.
 */
export async function transcodeToHls(inputKey: string) {
  const masterKey = hlsKeyFor(inputKey, Date.now().toString(36));
  const outDir = path.dirname(resolveMediaPath(masterKey));
  const audio = await hasAudio(inputKey);
  await Promise.all(
    HLS_LADDER.map((_, index) => fs.mkdir(path.join(outDir, `v${index}`), { recursive: true })),
  );
  const split = HLS_LADDER.map((_, index) => `[s${index}]`).join("");
  const scales = HLS_LADDER.map(
    ({ shortSide }, index) =>
      `[s${index}]scale='if(gt(iw,ih),-2,${shortSide})':'if(gt(iw,ih),${shortSide},-2)'[v${index}]`,
  ).join(";");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    resolveMediaPath(inputKey),
    "-filter_complex",
    `[0:v]split=${HLS_LADDER.length}${split};${scales}`,
  ];
  HLS_LADDER.forEach(({ maxrate, bufsize }, index) => {
    args.push("-map", `[v${index}]`);
    if (audio) args.push("-map", "0:a:0");
    args.push(`-maxrate:v:${index}`, maxrate, `-bufsize:v:${index}`, bufsize);
  });
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-force_key_frames",
    "expr:gte(t,n_forced*2)",
    "-sc_threshold",
    "0",
  );
  if (audio) args.push("-c:a", "aac", "-b:a", "96k", "-ac", "2");
  args.push(
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    path.join(outDir, "v%v", "seg-%03d.ts"),
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    HLS_LADDER.map((_, index) => (audio ? `v:${index},a:${index}` : `v:${index}`)).join(" "),
    path.join(outDir, "v%v", "index.m3u8"),
  );
  await run("ffmpeg", args, HLS_TIMEOUT_MS);
  return masterKey;
}

export async function probeVideoDuration(inputKey: string) {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    resolveMediaPath(inputKey),
  ]);
  const duration = parseDuration(result.stdout);
  if (!duration) throw new Error("ffprobe returned no usable video duration");
  return duration;
}

export class FfmpegVideoProcessor implements VideoProcessor {
  async process(inputKey: string, thumbnailKey: string): Promise<VideoProcessingResult> {
    try {
      const durationSec = await probeVideoDuration(inputKey);
      const timestamp = selectThumbnailTimestamp(durationSec);
      const output = resolveMediaPath(thumbnailKey);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        timestamp.toFixed(2),
        "-i",
        resolveMediaPath(inputKey),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-y",
        output,
      ]);
      const thumbnail = await fs.stat(output);
      if (!thumbnail.isFile() || thumbnail.size === 0)
        throw new Error("ffmpeg did not produce a thumbnail");
      const hlsPath = await transcodeToHls(inputKey).catch(() => inputKey);
      return {
        status: "READY",
        hlsPath,
        thumbnailUrl: `/media/${path.posix.normalize(thumbnailKey)}`,
        durationSec,
      };
    } catch (error) {
      return {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Video processing failed",
      };
    }
  }
}
