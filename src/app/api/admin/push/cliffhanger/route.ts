import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { isFcmConfigured, sendFcmNotifications } from "@/server/fcm";

const input = z.object({
  seriesId: z.string(),
  staleDays: z.number().int().positive().default(2),
  dryRun: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    const cutoff = new Date(Date.now() - data.staleDays * 86_400_000);
    const [series, progress] = await Promise.all([
      prisma.series.findUniqueOrThrow({
        where: { id: data.seriesId },
        include: { episodes: { select: { number: true } } },
      }),
      prisma.watchProgress.findMany({
        where: { updatedAt: { lte: cutoff }, episode: { seriesId: data.seriesId } },
        include: { episode: { select: { number: true } } },
      }),
    ]);
    const maxEpisode = Math.max(...series.episodes.map((episode) => episode.number));
    const latestByUser = new Map<string, number>();
    for (const row of progress) {
      const latest = latestByUser.get(row.userId) ?? 0;
      if (row.episode.number > latest) latestByUser.set(row.userId, row.episode.number);
    }
    const stale = [...latestByUser.entries()].filter(
      ([, episodeNumber]) => episodeNumber < maxEpisode,
    );
    const configured = await isFcmConfigured();
    const messageFor = (episodeNumber: number) =>
      `Find out what happens next in Episode ${episodeNumber + 1}!`;
    const logs = await prisma.$transaction(
      stale.map(([userId, episodeNumber]) =>
        prisma.notificationLog.create({
          data: {
            userId,
            seriesId: data.seriesId,
            episodeNumber: episodeNumber + 1,
            message: messageFor(episodeNumber),
            dryRun: !configured,
          },
        }),
      ),
    );
    let sendResult = { configured: false, sent: 0, failed: 0 };
    if (configured) {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: { in: stale.map(([userId]) => userId) } },
        select: { token: true },
      });
      sendResult = await sendFcmNotifications(
        tokens.map((item) => item.token),
        {
          title: series.title,
          body: `Find out what happens next in Episode ${maxEpisode}!`,
          data: { seriesSlug: series.slug },
        },
      );
    }
    return NextResponse.json({
      dryRun: !sendResult.configured,
      matchedUsers: stale.length,
      logs,
      ...sendResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push campaign failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
