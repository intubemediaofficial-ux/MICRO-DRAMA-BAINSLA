import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveMediaPath, serveMediaFile } from "@/server/media";
import { rewriteHlsManifest } from "@/server/hls";
import { verifyStreamToken } from "@/server/tokens";
import { resolveEpisodeEntitlement } from "@/server/entitlements";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  const { token } = await params;
  const verified = verifyStreamToken(token);
  if (!session || !verified || session.userId !== verified.userId)
    return NextResponse.json(
      { error: { message: "Invalid or expired stream token" } },
      { status: 401 },
    );
  const episode = await prisma.episode.findUnique({
    where: { id: verified.episodeId },
    include: { series: true },
  });
  if (!episode) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  const entitlement = await resolveEpisodeEntitlement(session.userId, episode.id);
  if (!entitlement.entitled)
    return NextResponse.json({ error: { message: "Locked" } }, { status: 403 });

  const requestedPath = new URL(request.url).searchParams.get("path");
  if (requestedPath) {
    const root = path.posix.dirname(episode.hlsPath.replace(/^\/media\//, ""));
    const requested = path.posix.normalize(requestedPath.replace(/^\/media\//, ""));
    if (requested !== root && !requested.startsWith(`${root}/`)) {
      return NextResponse.json({ error: { message: "Invalid media path" } }, { status: 400 });
    }
    return serveMediaFile(request, requested);
  }
  if (!episode.hlsPath.endsWith(".m3u8")) return serveMediaFile(request, episode.hlsPath);

  try {
    const manifestPath = resolveMediaPath(episode.hlsPath);
    const manifest = await fs.readFile(manifestPath, "utf8");
    const rewritten = rewriteHlsManifest(manifest, token, episode.hlsPath);
    return new NextResponse(rewritten, {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "cache-control": "private, max-age=30",
      },
    });
  } catch {
    return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
  }
}
