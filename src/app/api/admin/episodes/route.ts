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
        coinPrice: z.number().int().positive(),
        isFree: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    const series = await prisma.series.findUnique({
      where: { id: data.seriesId },
      select: { posterUrl: true },
    });
    if (!series) throw new Error("Series not found");
    const thumbnailUrl = series.posterUrl;
    const episodes = await prisma.$transaction(
      data.episodes.map((episode) =>
        prisma.episode.create({
          data: {
            ...episode,
            seriesId: data.seriesId,
            durationSec: 90,
            hlsPath: "sample.mp4",
            thumbnailUrl,
            thumbnailSource: "LEGACY",
          },
        }),
      ),
    );
    return NextResponse.json({ episodes }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Episode creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
