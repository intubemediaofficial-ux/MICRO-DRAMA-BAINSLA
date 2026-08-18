import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  seriesId: z.string(),
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
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    const episodes = await prisma.$transaction(
      data.episodes.map((episode) =>
        prisma.episode.create({ data: { ...episode, seriesId: data.seriesId } }),
      ),
    );
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
