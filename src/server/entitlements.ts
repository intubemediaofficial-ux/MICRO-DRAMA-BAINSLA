import { prisma } from "./db";

export type EntitlementResult = {
  entitled: boolean;
  reason: "FREE" | "COIN" | "SUBSCRIPTION" | "LOCKED";
  subscriptionStatus?: string;
};

export type EpisodeEntitlementInput = {
  id: string;
  number: number;
  isFree: boolean;
};

export async function resolveEpisodeEntitlement(
  userId: string | null,
  episodeId: string,
): Promise<EntitlementResult> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { series: { select: { freeEpisodeCount: true } } },
  });
  if (!episode) return { entitled: false, reason: "LOCKED" };
  if (episode.isFree || episode.number <= episode.series.freeEpisodeCount)
    return { entitled: true, reason: "FREE" };
  if (!userId) return { entitled: false, reason: "LOCKED" };
  const [unlock, subscription] = await Promise.all([
    prisma.episodeUnlock.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
      select: { id: true },
    }),
    prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          {
            status: "TRIALING",
            trialEndsAt: { gt: new Date() },
            invoices: { some: { kind: "TRIAL", status: "PAID" } },
          },
          {
            status: "ACTIVE",
            currentPeriodEnd: { gt: new Date() },
            invoices: { some: { status: "PAID" } },
          },
          {
            status: "PAST_DUE",
            currentPeriodEnd: { gt: new Date() },
            invoices: { some: { status: "PAID" } },
          },
        ],
      },
      orderBy: { currentPeriodEnd: "desc" },
      select: { status: true, currentPeriodEnd: true },
    }),
  ]);
  if (unlock) return { entitled: true, reason: "COIN" };
  if (subscription)
    return {
      entitled: true,
      reason: "SUBSCRIPTION",
      subscriptionStatus: subscription.status,
    };
  return { entitled: false, reason: "LOCKED" };
}

export async function resolveSeriesEpisodeEntitlements(
  userId: string | null,
  episodes: readonly EpisodeEntitlementInput[],
  freeEpisodeCount: number,
): Promise<Map<string, EntitlementResult>> {
  let unlockedEpisodeIds = new Set<string>();
  let subscriptionStatus: string | undefined;

  if (userId) {
    const now = new Date();
    const [unlocks, subscription] = await Promise.all([
      prisma.episodeUnlock.findMany({
        where: { userId, episodeId: { in: episodes.map((episode) => episode.id) } },
        select: { episodeId: true },
      }),
      prisma.subscription.findFirst({
        where: {
          userId,
          OR: [
            {
              status: "TRIALING",
              trialEndsAt: { gt: now },
              invoices: { some: { kind: "TRIAL", status: "PAID" } },
            },
            {
              status: "ACTIVE",
              currentPeriodEnd: { gt: now },
              invoices: { some: { status: "PAID" } },
            },
            {
              status: "PAST_DUE",
              currentPeriodEnd: { gt: now },
              invoices: { some: { status: "PAID" } },
            },
          ],
        },
        orderBy: { currentPeriodEnd: "desc" },
        select: { status: true, currentPeriodEnd: true },
      }),
    ]);
    unlockedEpisodeIds = new Set(unlocks.map((unlock) => unlock.episodeId));
    subscriptionStatus = subscription?.status;
  }

  const result = new Map<string, EntitlementResult>();
  for (const episode of episodes) {
    if (episode.isFree || episode.number <= freeEpisodeCount) {
      result.set(episode.id, { entitled: true, reason: "FREE" });
    } else if (unlockedEpisodeIds.has(episode.id)) {
      result.set(episode.id, { entitled: true, reason: "COIN" });
    } else if (subscriptionStatus) {
      result.set(episode.id, {
        entitled: true,
        reason: "SUBSCRIPTION",
        subscriptionStatus,
      });
    } else {
      result.set(episode.id, { entitled: false, reason: "LOCKED" });
    }
  }
  return result;
}

export async function hasActiveSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        {
          status: "TRIALING",
          trialEndsAt: { gt: new Date() },
          invoices: { some: { kind: "TRIAL", status: "PAID" } },
        },
        {
          status: "ACTIVE",
          currentPeriodEnd: { gt: new Date() },
          invoices: { some: { status: "PAID" } },
        },
        {
          status: "PAST_DUE",
          currentPeriodEnd: { gt: new Date() },
          invoices: { some: { status: "PAID" } },
        },
      ],
    },
    select: { id: true, status: true, currentPeriodEnd: true },
  });
  return subscription;
}
