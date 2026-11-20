import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordUserActivityDay } from "@/server/activity";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { findPublicEpisode, publicSeriesWhere } from "@/server/publishing";

const names = [
  "app_open",
  "series_view",
  "play_start",
  "play_25",
  "play_50",
  "play_75",
  "play_complete",
  "unlock_prompt",
  "subscribe_click",
  "share",
  "ad_reward",
] as const;
const eventSchema = z.object({
  name: z.enum(names),
  seriesId: z.string().optional(),
  episodeId: z.string().optional(),
  positionSec: z.number().int().nonnegative().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});
const input = z.object({
  deviceId: z.string().max(128).optional(),
  events: z.array(eventSchema).min(1).max(50),
});

export async function POST(request: Request) {
  const session = await getSession();
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const key = session ? `events:${session.userId}` : `events:${ip}`;
  if (!rateLimit(key, 20))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  try {
    const data = input.parse(await request.json());
    const rows = [];
    for (const event of data.events) {
      if (event.props && Buffer.byteLength(JSON.stringify(event.props)) > 2_048)
        return NextResponse.json({ error: { message: "Event properties are too large" } }, { status: 400 });
      let seriesId = event.seriesId;
      if (event.episodeId) {
        const episode = await findPublicEpisode(event.episodeId);
        if (!episode || (seriesId && episode.seriesId !== seriesId))
          return NextResponse.json({ error: { message: "Public episode not found" } }, { status: 400 });
        seriesId = episode.seriesId;
      }
      if (seriesId) {
        const series = await prisma.series.findFirst({
          where: { id: seriesId, ...publicSeriesWhere },
          select: { id: true },
        });
        if (!series)
          return NextResponse.json({ error: { message: "Public series not found" } }, { status: 400 });
      }
      rows.push({
        name: event.name,
        userId: session?.userId,
        deviceId: data.deviceId,
        seriesId,
        episodeId: event.episodeId,
        positionSec: event.positionSec,
        props: event.props as Prisma.InputJsonValue | undefined,
      });
    }
    await prisma.analyticsEvent.createMany({ data: rows });
    if (session) void recordUserActivityDay(session.userId).catch(() => {});
    return NextResponse.json({ accepted: rows.length }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof z.ZodError ? "Invalid event batch" : "Events rejected" } },
      { status: 400 },
    );
  }
}
