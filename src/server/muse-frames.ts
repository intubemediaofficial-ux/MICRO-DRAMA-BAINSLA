import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveMediaPath } from "./media";
import { run } from "./video-processor";

async function probeDuration(mediaPath: string) {
  try {
    const result = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mediaPath,
    ]);
    const duration = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function playlistDuration(contents: string) {
  const segments = [...contents.matchAll(/#EXTINF:([0-9.]+)/g)]
    .map((match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return segments.length ? segments.reduce((total, value) => total + value, 0) : null;
}

async function durationFor(mediaKey: string, mediaPath: string) {
  const probed = await probeDuration(mediaPath);
  if (probed) return probed;
  if (!mediaKey.toLowerCase().endsWith(".m3u8")) throw new Error("MUSE_MEDIA_INVALID");

  const contents = await fs.readFile(mediaPath, "utf8");
  const variant = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (variant && !variant.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(variant)) {
    const variantKey = path.posix.join(path.posix.dirname(mediaKey), variant);
    const variantPath = resolveMediaPath(variantKey);
    const variantProbed = await probeDuration(variantPath);
    if (variantProbed) return variantProbed;
    const variantContents = await fs.readFile(variantPath, "utf8");
    const variantDuration = playlistDuration(variantContents);
    if (variantDuration) return variantDuration;
  }
  const duration = playlistDuration(contents);
  if (duration) return duration;
  throw new Error("MUSE_MEDIA_INVALID");
}

export async function extractFrames(mediaKey: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 10)
    throw new Error("MUSE_MEDIA_INVALID");

  const mediaPath = resolveMediaPath(mediaKey);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "muse-frames-"));
  try {
    const duration = await durationFor(mediaKey, mediaPath);
    const frames: string[] = [];
    for (let index = 0; index < count; index++) {
      const fraction =
        count === 1 ? 0.475 : 0.05 + (0.9 - 0.05) * (index / (count - 1));
      const timestamp = duration * fraction;
      const output = path.join(directory, `frame-${index + 1}.jpg`);
      await run(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          timestamp.toFixed(3),
          "-i",
          mediaPath,
          "-vf",
          "scale=480:-2",
          "-frames:v",
          "1",
          "-q:v",
          "4",
          "-y",
          output,
        ],
        120_000,
      );
      const frame = await fs.readFile(output);
      if (!frame.length) throw new Error("MUSE_MEDIA_INVALID");
      frames.push(`data:image/jpeg;base64,${frame.toString("base64")}`);
    }
    return frames;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
