import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { duplicateSkuMessage, episodeNumberConflictMessage } from "@/server/episode-validation";

const input = z.object({
  title: z.string().min(1).optional(),
  number: z.number().int().positive().optional(),
  durationSec: z.number().int().positive().optional(),
  hlsPath: z.string().min(1).optional(),
  thumbnailUrl: z.string().min(1).optional(),
  isFree: z.boolean().optional(),
  coinPrice: z.number().int().positive().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  seasonId: z.string().nullable().optional(),
  originalFilename: z.string().max(255).nullable().optional(),
  sku: z.string().trim().max(120).transform((value) => value || null).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = input.parse(await request.json());
    const existing = await prisma.episode.findUnique({ where: { id }, select: { seriesId: true } });
    if (!existing) return NextResponse.json({ error: { message: "Episode not found" } }, { status: 404 });
    if (data.seasonId) {
      const season = await prisma.season.findUnique({ where: { id: data.seasonId }, select: { seriesId: true } });
      if (!season || season.seriesId !== existing.seriesId)
        return NextResponse.json({ error: { message: "Season must belong to the same series" } }, { status: 400 });
    }
    if (data.number !== undefined) {
      const duplicateNumber = await prisma.episode.findFirst({
        where: { seriesId: existing.seriesId, number: data.number, id: { not: id } },
        select: { id: true },
      });
      if (duplicateNumber)
        return NextResponse.json(
          { error: { message: episodeNumberConflictMessage(data.number) } },
          { status: 409 },
        );
    }
    if (data.sku) {
      const duplicate = await prisma.episode.findFirst({
        where: { sku: data.sku, id: { not: id } },
        select: { title: true },
      });
      if (duplicate)
        return NextResponse.json(
          { error: { message: duplicateSkuMessage(data.sku, duplicate.title) } },
          { status: 409 },
        );
    }
    try {
      return NextResponse.json(
        await prisma.episode.update({
          where: { id },
          data: { ...data, ...(data.thumbnailUrl ? { thumbnailSource: "CUSTOM" } : {}) },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (data.number !== undefined) {
          const duplicateNumber = await prisma.episode.findFirst({
            where: { seriesId: existing.seriesId, number: data.number, id: { not: id } },
            select: { id: true },
          });
          if (duplicateNumber)
            return NextResponse.json(
              { error: { message: episodeNumberConflictMessage(data.number) } },
              { status: 409 },
            );
        }
        if (data.sku) {
          const duplicate = await prisma.episode.findFirst({
            where: { sku: data.sku, id: { not: id } },
            select: { title: true },
          });
          if (duplicate)
            return NextResponse.json(
              { error: { message: duplicateSkuMessage(data.sku, duplicate.title) } },
              { status: 409 },
            );
          return NextResponse.json(
            { error: { message: duplicateSkuMessage(data.sku) } },
            { status: 409 },
          );
        }
      }
      throw error;
    }
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
