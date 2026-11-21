import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { isProtectedEpisodeMedia, serveMediaFile } from "@/server/media";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.join("/");
  if (isProtectedEpisodeMedia(key)) {
    try {
      await adminSession();
    } catch {
      return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
    }
    return serveMediaFile(request, key, "private, no-store");
  }
  return serveMediaFile(request, key, "public, max-age=604800");
}
