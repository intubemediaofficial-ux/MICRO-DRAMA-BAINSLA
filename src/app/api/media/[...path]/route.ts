import { NextResponse } from "next/server";
import { isProtectedEpisodeMedia, serveMediaFile } from "@/server/media";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.join("/");
  // Episode videos are only reachable through signed /api/stream tokens.
  if (isProtectedEpisodeMedia(key))
    return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
  return serveMediaFile(request, key, "public, max-age=604800");
}
