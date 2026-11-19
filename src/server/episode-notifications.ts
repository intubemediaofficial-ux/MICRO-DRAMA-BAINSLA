import { Prisma } from "@prisma/client";
import { isFcmConfigured, sendFcmNotifications } from "./fcm";
import { prisma } from "./db";
import { publicEpisodeWhere } from "./publishing";

export async function notifyNewPublicEpisode(episodeId: string) {
  const configured = await isFcmConfigured();
  const recipients = await prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findFirst({
      where: { id: episodeId, ...publicEpisodeWhere, series: { isPublished: true } },
      select: {
        id: true,
        number: true,
        title: true,
        seriesId: true,
        series: { select: { slug: true, title: true } },
      },
    });
    if (!episode) return null;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Series" WHERE id = ${episode.seriesId} FOR UPDATE`);
    const recentlySent = await tx.notificationLog.findFirst({
      where: {
        seriesId: episode.seriesId,
        kind: "NEW_EPISODE",
        sentAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentlySent) return null;
    const [watchlist, progress] = await Promise.all([
      tx.watchlistItem.findMany({ where: { seriesId: episode.seriesId }, select: { userId: true } }),
      tx.watchProgress.findMany({
        where: { episode: { seriesId: episode.seriesId } },
        select: { userId: true },
      }),
    ]);
    const userIds = [...new Set([...watchlist, ...progress].map((entry) => entry.userId))];
    if (!userIds.length) return null;
    await tx.notificationLog.createMany({
      data: userIds.map((userId) => ({
        userId,
        seriesId: episode.seriesId,
        episodeNumber: episode.number,
        message: `${episode.series.title}: ${episode.title} is now available`,
        kind: "NEW_EPISODE",
        dryRun: !configured,
      })),
    });
    return { episode, userIds };
  });
  if (!recipients || !configured) return;
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: recipients.userIds } },
    select: { token: true },
  });
  await sendFcmNotifications(
    tokens.map((item) => item.token),
    {
      title: recipients.episode.series.title,
      body: `${recipients.episode.title} is now available`,
      data: {
        seriesSlug: recipients.episode.series.slug,
        episodeId: recipients.episode.id,
      },
    },
  );
}
