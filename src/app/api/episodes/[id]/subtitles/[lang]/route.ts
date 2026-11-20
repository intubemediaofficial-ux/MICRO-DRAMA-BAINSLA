import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { findPublicEpisode } from "@/server/publishing";
import { getSession } from "@/server/auth";
import { resolveEpisodeEntitlement } from "@/server/entitlements";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; lang: string }> },
) {
  const { id, lang } = await params;
  const episode = await findPublicEpisode(id);
  if (!episode)
    return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  const session = await getSession();
  if (!(await resolveEpisodeEntitlement(session?.userId ?? null, id)).entitled)
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 403 });
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
    const contentType = path.extname(file).toLowerCase() === ".vtt" ? "text/vtt" : "application/x-subrip";
    return new NextResponse(await fs.readFile(file), { headers: { "content-type": contentType } });
  } catch {
    return NextResponse.json({ error: { message: "Subtitle file not found" } }, { status: 404 });
  }
}
