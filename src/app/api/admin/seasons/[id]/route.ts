import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { seasonHasEpisodesMessage } from "@/server/episode-validation";

const updateInput = z.object({
  number: z.number().int().positive().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = updateInput.parse(await request.json());
    let season;
    try {
      season = await prisma.season.update({
        where: { id },
        data,
        include: { _count: { select: { episodes: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          {
            error: {
              message:
                data.number === undefined
                  ? "Season number already exists in this series"
                  : `Season number ${data.number} already exists in this series`,
            },
          },
          { status: 409 },
        );
      }
      throw error;
    }
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
      return NextResponse.json({ error: { message: seasonHasEpisodesMessage() } }, { status: 409 });
    }
    await prisma.season.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season deletion failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
