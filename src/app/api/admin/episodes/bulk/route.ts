import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import {
  duplicateSkuMessage,
  episodeNumberConflictMessage,
  findEpisodeNumberCollision,
} from "@/server/episode-validation";

const input = z.object({
  seriesId: z.string(),
  seasonId: z.string().optional(),
  episodes: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string().min(1),
        durationSec: z.number().int().positive().default(90),
        hlsPath: z.string().default("sample.mp4"),
        thumbnailUrl: z.string().default("/media/thumb-0.jpg"),
        isFree: z.boolean().default(false),
        coinPrice: z.number().int().positive().default(10),
        publishedAt: z.coerce.date().optional(),
        originalFilename: z.string().max(255).nullable().optional(),
        sku: z.string().trim().max(120).transform((value) => value || null).nullable().optional(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    const series = await prisma.series.findUnique({
      where: { id: data.seriesId },
      select: { id: true, posterUrl: true },
    });
    if (!series) return NextResponse.json({ error: { message: "Series not found" } }, { status: 404 });
    const season = data.seasonId
      ? await prisma.season.findUnique({ where: { id: data.seasonId }, select: { id: true, seriesId: true } })
      : await prisma.season.findFirst({
          where: { seriesId: data.seriesId },
          orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
          select: { id: true, seriesId: true },
        });
    if (!season || season.seriesId !== data.seriesId)
      return NextResponse.json({ error: { message: "A season for this series is required" } }, { status: 400 });
    const existingNumbers = (await prisma.episode.findMany({
      where: { seriesId: data.seriesId },
      select: { number: true },
    })).map((episode) => episode.number);
    const collision = findEpisodeNumberCollision(existingNumbers, data.episodes.map((episode) => episode.number));
    if (collision !== null)
      return NextResponse.json(
        { error: { message: episodeNumberConflictMessage(collision) } },
        { status: 409 },
      );
    const skus = data.episodes.map((episode) => episode.sku).filter((sku): sku is string => Boolean(sku));
    if (new Set(skus).size !== skus.length)
      return NextResponse.json({ error: { message: "SKU must be unique within this upload" } }, { status: 409 });
    const duplicate = skus.length
      ? await prisma.episode.findFirst({ where: { sku: { in: skus } }, select: { sku: true, title: true } })
      : null;
    if (duplicate?.sku)
      return NextResponse.json({ error: { message: duplicateSkuMessage(duplicate.sku, duplicate.title) } }, { status: 409 });
    let episodes;
    try {
      episodes = await prisma.$transaction(
        data.episodes.map((episode) =>
          prisma.episode.create({
            data: {
              ...episode,
              seriesId: data.seriesId,
              seasonId: season.id,
              thumbnailUrl: episode.thumbnailUrl ?? series.posterUrl,
            },
          }),
        ),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = skus.length
          ? await prisma.episode.findFirst({
              where: { sku: { in: skus } },
              select: { sku: true, title: true },
            })
          : null;
        if (duplicate?.sku)
          return NextResponse.json(
            { error: { message: duplicateSkuMessage(duplicate.sku, duplicate.title) } },
            { status: 409 },
          );
      }
      throw error;
    }
    return NextResponse.json({ episodes }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk episode creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

const bulkUpdate = z.object({
  episodeIds: z.array(z.string()).min(1),
  coinPrice: z.number().int().positive().optional(),
  isFree: z.boolean().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  numbers: z.array(z.object({ id: z.string(), number: z.number().int().positive() })).optional(),
});

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const data = bulkUpdate.parse(await request.json());
    const ids = new Set(data.episodeIds);
    if (data.numbers && data.numbers.some((item) => !ids.has(item.id)))
      throw new Error("NUMBER_UPDATE_OUTSIDE_SELECTION");
    const result = await prisma.$transaction(async (tx) => {
      if (data.numbers?.length) {
        for (const item of data.numbers)
          await tx.episode.update({ where: { id: item.id }, data: { number: -item.number } });
        for (const item of data.numbers)
          await tx.episode.update({ where: { id: item.id }, data: { number: item.number } });
      }
      const update = Object.fromEntries(
        Object.entries({
          coinPrice: data.coinPrice,
          isFree: data.isFree,
          publishedAt: data.publishedAt,
        }).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(update).length)
        await tx.episode.updateMany({ where: { id: { in: data.episodeIds } }, data: update });
      return tx.episode.findMany({
        where: { id: { in: data.episodeIds } },
        orderBy: { number: "asc" },
      });
    });
    return NextResponse.json({ episodes: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk episode update failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
