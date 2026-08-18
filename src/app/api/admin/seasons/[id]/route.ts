import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const updateInput = z.object({
  number: z.number().int().positive().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const season = await prisma.season.update({
      where: { id },
      data: updateInput.parse(await request.json()),
      include: { _count: { select: { episodes: true } } },
    });
    return NextResponse.json({ season });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season update failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const count = await prisma.episode.count({ where: { seasonId: id } });
    if (count) {
      return NextResponse.json({ error: { message: "SEASON_HAS_EPISODES" } }, { status: 409 });
    }
    await prisma.season.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season deletion failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
