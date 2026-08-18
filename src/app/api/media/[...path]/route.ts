import { serveMediaFile } from "@/server/media";

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  return serveMediaFile(request, parts.join("/"));
}
