import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { hasPlayableVideo } from "@/lib/publishing";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  storage,
  UploadTooLargeError,
} from "@/server/storage";
import { enqueueEpisodeVideo } from "@/server/video-queue";

export const runtime = "nodejs";

function filenameFromRequest(request: Request, contentType: string) {
  if (contentType.startsWith("multipart/form-data")) return null;
  if (!contentType.startsWith("video/") && !contentType.startsWith("application/octet-stream"))
    throw new Error("Send a video file.");
  const value = request.headers.get("x-filename");
  if (!value) throw new Error("A video filename is required.");
  try {
    return decodeURIComponent(value).trim();
  } catch {
    throw new Error("The video filename is invalid.");
  }
}

function safeFilename(filename: string) {
  return filename.replace(/[\u0000-\u001f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255) || "video.mp4";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const existing = await prisma.episode.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: { message: "Episode not found" } }, { status: 404 });
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_UPLOAD_BYTES)
      return NextResponse.json(
        { error: { message: "Video files must be 2 GB or smaller." } },
        { status: 413 },
      );
    let body: ReadableStream<Uint8Array> | null = request.body;
    let filename = filenameFromRequest(request, contentType);
    if (contentType.startsWith("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json(
          { error: { message: "A video file is required." } },
          { status: 400 },
        );
      }
      if (file.size > MAX_VIDEO_UPLOAD_BYTES)
        return NextResponse.json(
          { error: { message: "Video files must be 2 GB or smaller." } },
          { status: 413 },
        );
      filename = file.name;
      body = file.stream();
    }
    if (!body || !filename)
      return NextResponse.json(
        { error: { message: "A video file is required." } },
        { status: 400 },
      );

    const originalFilename = filename.replace(/[\u0000-\u001f]/g, "").slice(0, 255);
    const key = `episodes/${id}-${Date.now().toString(36)}-${safeFilename(originalFilename)}`;
    await storage.putStream(key, body, MAX_VIDEO_UPLOAD_BYTES);
    const publishOnReady = new URL(request.url).searchParams.get("publish") === "1";
    const episode = await prisma.episode.update({
      where: { id },
      data: {
        processingStatus: "PROCESSING",
        processingError: null,
        sourceKey: key,
        publishOnReady,
        ...(!hasPlayableVideo(existing) ? { publishedAt: null } : {}),
        originalFilename,
      },
    });
    enqueueEpisodeVideo(id);
    return NextResponse.json({ episode, queued: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed";
    return NextResponse.json(
      { error: { message } },
      {
        status:
          error instanceof UploadTooLargeError
            ? 413
            : message === "FORBIDDEN"
              ? 403
              : message === "UNAUTHENTICATED"
                ? 401
                : 400,
      },
    );
  }
}
