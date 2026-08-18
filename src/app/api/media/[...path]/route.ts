import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/server/config";
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const file = path.resolve(env.MEDIA_DIR, ...parts);
  if (!file.startsWith(path.resolve(env.MEDIA_DIR)))
    return NextResponse.json({ error: { message: "Invalid path" } }, { status: 400 });
  try {
    const data = await fs.readFile(file);
    return new NextResponse(data);
  } catch {
    return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
  }
}
