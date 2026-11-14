import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { findPublicEpisode } from "@/server/publishing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; lang: string }> },
) {
  const { id, lang } = await params;
  if (!(await findPublicEpisode(id)))
    return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  const subtitle = await prisma.subtitle.findUnique({
    where: { episodeId_lang: { episodeId: id, lang } },
  });
  if (!subtitle)
    return NextResponse.json({ error: { message: "Subtitle not found" } }, { status: 404 });
  const file = path.resolve(env.MEDIA_DIR, subtitle.srtPath);
  if (!file.startsWith(path.resolve(env.MEDIA_DIR))) {
    return NextResponse.json({ error: { message: "Invalid subtitle path" } }, { status: 400 });
  }
  try {
    return new NextResponse(await fs.readFile(file), { headers: { "content-type": "text/vtt" } });
  } catch {
    return NextResponse.json({ error: { message: "Subtitle file not found" } }, { status: 404 });
  }
}
