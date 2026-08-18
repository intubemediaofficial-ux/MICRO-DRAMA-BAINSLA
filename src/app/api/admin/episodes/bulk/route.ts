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
