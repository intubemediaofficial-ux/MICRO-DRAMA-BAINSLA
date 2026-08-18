import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { storage } from "@/server/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const form = await request.formData();
    const lang = z.string().min(2).parse(form.get("lang"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: { message: "An SRT file is required" } }, { status: 400 });
    }
    const key = `subtitles/${id}-${lang}.srt`;
    await storage.put(key, Buffer.from(await file.arrayBuffer()));
    const subtitle = await prisma.subtitle.upsert({
      where: { episodeId_lang: { episodeId: id, lang } },
      update: { srtPath: key },
      create: { episodeId: id, lang, srtPath: key },
    });
    return NextResponse.json({ subtitle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subtitle upload failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const { lang } = z.object({ lang: z.string().min(2) }).parse(await request.json());
    await prisma.subtitle.delete({ where: { episodeId_lang: { episodeId: id, lang } } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subtitle deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
