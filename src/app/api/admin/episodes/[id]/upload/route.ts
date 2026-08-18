import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { storage } from "@/server/storage";
import { PassThroughVideoProcessor } from "@/server/video-processor";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: { message: "A video file is required" } }, { status: 400 });
    }
    const key = `episodes/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.put(key, Buffer.from(await file.arrayBuffer()));
    const processed = await new PassThroughVideoProcessor().process(key, key);
    const episode = await prisma.episode.update({
      where: { id },
      data: { hlsPath: processed.hlsPath, thumbnailUrl: processed.thumbnailUrl },
    });
    return NextResponse.json({ episode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
