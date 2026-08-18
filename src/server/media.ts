import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "./config";

const mediaRoot = () => path.resolve(env.MEDIA_DIR);

export function normalizeMediaKey(value: string) {
  return value.replace(/^\/(?:api\/media|media)\//, "").replaceAll("\\", "/");
}

export function resolveMediaPath(key: string) {
  const root = mediaRoot();
  const resolved = path.resolve(root, normalizeMediaKey(key));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid media path");
  }
  return resolved;
}

export function isPlaceholderThumbnail(value: string) {
  const key = normalizeMediaKey(value);
  return /^thumb-\d+\.jpg$/i.test(key) || /^demo\/thumb-\d+\.jpg$/i.test(key);
}

export function mediaContentType(key: string) {
  switch (path.extname(key).toLowerCase()) {
    case ".m3u8":
      return "application/vnd.apple.mpegurl";
    case ".ts":
      return "video/mp2t";
    case ".m4s":
      return "video/iso.segment";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".vtt":
      return "text/vtt; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) return "invalid" as const;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    return "invalid" as const;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function serveMediaFile(request: Request, key: string) {
  let file: string;
  try {
    file = resolveMediaPath(key);
  } catch {
    return NextResponse.json({ error: { message: "Invalid path" } }, { status: 400 });
  }
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error("Not a file");
    const range = parseRange(request.headers.get("range"), stat.size);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${stat.size}` },
      });
    }
    const data = await fs.readFile(file);
    const start = range?.start ?? 0;
    const end = range?.end ?? stat.size - 1;
    const body = data.subarray(start, end + 1);
    const headers = new Headers({
      "content-type": mediaContentType(key),
      "accept-ranges": "bytes",
      "content-length": String(body.byteLength),
      "cache-control": "private, max-age=60",
    });
    if (range) {
      headers.set("content-range", `bytes ${start}-${end}/${stat.size}`);
      return new NextResponse(body, { status: 206, headers });
    }
    return new NextResponse(body, { headers });
  } catch {
    return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
  }
}
