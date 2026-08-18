import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { buildEpisodeUploadMetadata } from "@/server/episode-validation";
import { storage } from "@/server/storage";
import { FfmpegVideoProcessor, thumbnailPersistence } from "@/server/video-processor";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: { message: "A video file is required" } }, { status: 400 });
    }
    const existing = await prisma.episode.findUnique({ where: { id } });
    if (!existing)
      return NextResponse.json({ error: { message: "Episode not found" } }, { status: 404 });
    const key = `episodes/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.put(key, Buffer.from(await file.arrayBuffer()));
    await prisma.episode.update({
      where: { id },
      data: {
        processingStatus: "PROCESSING",
        processingError: null,
        originalFilename: existing.originalFilename ?? file.name,
      },
    });
    const thumbnailKey = `${key.replace(/\.[^.]+$/, "")}.jpg`;
    const processed = await new FfmpegVideoProcessor().process(key, thumbnailKey);
    if (processed.status === "FAILED") {
      const episode = await prisma.episode.update({
        where: { id },
        data: { processingStatus: "FAILED", processingError: processed.error },
      });
      return NextResponse.json({ episode, processing: processed }, { status: 202 });
    }
    const episode = await prisma.episode.update({
      where: { id },
      data: {
        hlsPath: processed.hlsPath,
        ...buildEpisodeUploadMetadata({
          originalFilename: existing.originalFilename ?? file.name,
          durationSec: processed.durationSec,
          sku: existing.sku,
        }),
        processingStatus: "READY",
        processingError: null,
        ...thumbnailPersistence(existing.thumbnailSource, processed.thumbnailUrl),
      },
    });
    return NextResponse.json({ episode, processing: processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
