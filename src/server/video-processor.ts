import { execFile } from "node:child_process";
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
  return Math.min(15, Math.max(10, durationSec - 0.5));
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

async function run(command: string, args: string[], timeout = DEFAULT_TIMEOUT_MS) {
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
      return {
        status: "READY",
        hlsPath: inputKey,
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
