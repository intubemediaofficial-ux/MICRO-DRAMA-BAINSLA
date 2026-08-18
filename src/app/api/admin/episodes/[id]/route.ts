import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  title: z.string().min(1).optional(),
  number: z.number().int().positive().optional(),
  durationSec: z.number().int().positive().optional(),
  hlsPath: z.string().min(1).optional(),
  thumbnailUrl: z.string().min(1).optional(),
  isFree: z.boolean().optional(),
  coinPrice: z.number().int().positive().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    return NextResponse.json(
      await prisma.episode.update({ where: { id }, data: input.parse(await request.json()) }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Episode update failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    if (await prisma.episodeUnlock.count({ where: { episodeId: id } }))
      throw new Error("EPISODE_HAS_PAID_HISTORY");
    await prisma.episode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Episode deletion failed";
    return NextResponse.json(
      { error: { message } },
      {
        status: message === "FORBIDDEN" ? 403 : message === "EPISODE_HAS_PAID_HISTORY" ? 409 : 400,
      },
    );
  }
}
