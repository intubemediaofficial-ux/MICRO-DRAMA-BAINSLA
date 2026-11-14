import { Prisma, LedgerType, UnlockSource } from "@prisma/client";
import { prisma } from "./db";

export class InsufficientCoins extends Error {
  constructor() {
    super("INSUFFICIENT_COINS");
  }
}
type Ref = { type: string; id: string };
export const CHECKIN_REWARDS = [5, 8, 12, 16, 22, 30, 50];

function utcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDailyCheckinStatus(userId: string) {
  const day = utcDay();
  const yesterday = new Date(day);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const [checkin, prior] = await Promise.all([
    prisma.dailyCheckin.findUnique({ where: { userId_day: { userId, day } } }),
    prisma.dailyCheckin.findFirst({
      where: { userId, day: { lt: day } },
      orderBy: { day: "desc" },
    }),
  ]);
  const streak =
    checkin?.streak ?? (prior?.day.getTime() === yesterday.getTime() ? prior.streak : 0);
  return {
    checkedInToday: Boolean(checkin),
    streak,
    nextReward: CHECKIN_REWARDS[Math.min(streak, CHECKIN_REWARDS.length - 1)] ?? 5,
    rewards: CHECKIN_REWARDS,
  };
}

export async function claimDailyCheckin(userId: string) {
  const day = utcDay();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dailyCheckin.findUnique({
      where: { userId_day: { userId, day } },
    });
    if (existing) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { coinBalance: true },
      });
      return { checkin: existing, coinsAwarded: 0, balance: user.coinBalance, alreadyCheckedIn: true };
    }
    const yesterday = new Date(day);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const prior = await tx.dailyCheckin.findFirst({
      where: { userId, day: { lt: day } },
      orderBy: { day: "desc" },
    });
    const streak = prior?.day.getTime() === yesterday.getTime() ? Math.min(prior.streak + 1, 7) : 1;
    const inserted = await tx.dailyCheckin.createMany({
      data: [{ userId, day, streak }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const [checkin, user] = await Promise.all([
        tx.dailyCheckin.findUniqueOrThrow({ where: { userId_day: { userId, day } } }),
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } }),
      ]);
      return { checkin, coinsAwarded: 0, balance: user.coinBalance, alreadyCheckedIn: true };
    }
    const reward = CHECKIN_REWARDS[streak - 1] ?? CHECKIN_REWARDS[0]!;
    const updated = await tx.user.updateMany({
      where: { id: userId },
      data: { coinBalance: { increment: reward } },
    });
    if (updated.count !== 1) throw new Error("USER_NOT_FOUND");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coinBalance: true },
    });
    await tx.coinTransaction.create({
      data: {
        userId,
        delta: reward,
        type: "DAILY_CHECKIN",
        balanceAfter: user.coinBalance,
        refType: "day",
        refId: day.toISOString(),
      },
    });
    const checkin = await tx.dailyCheckin.findUniqueOrThrow({
      where: { userId_day: { userId, day } },
    });
    return { checkin, coinsAwarded: reward, balance: user.coinBalance, alreadyCheckedIn: false };
  });
}

export async function adjustCoins(userId: string, delta: number, reason: string, actorId: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("INVALID_COIN_ADJUSTMENT");
  if (!reason.trim()) throw new Error("ADJUSTMENT_REASON_REQUIRED");
  if (reason.length > 240) throw new Error("ADJUSTMENT_REASON_TOO_LONG");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, ...(delta < 0 ? { coinBalance: { gte: -delta } } : {}) },
      data: { coinBalance: { increment: delta } },
    });
    if (updated.count !== 1) throw new Error(delta < 0 ? "INSUFFICIENT_COINS" : "USER_NOT_FOUND");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coinBalance: true },
    });
    return tx.coinTransaction.create({
      data: {
        userId,
        delta,
        type: "ADMIN_ADJUST",
        balanceAfter: user.coinBalance,
        refType: "admin",
        refId: actorId,
        reason: reason.trim(),
      },
    });
  });
}

export async function credit(userId: string, delta: number, type: LedgerType, ref?: Ref) {
  if (delta <= 0) throw new Error("CREDIT_MUST_BE_POSITIVE");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId },
      data: { coinBalance: { increment: delta } },
    });
    if (updated.count !== 1) throw new Error("USER_NOT_FOUND");
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coinBalance: true },
    });
    return tx.coinTransaction.create({
      data: {
        userId,
        delta,
        type,
        balanceAfter: user.coinBalance,
        refType: ref?.type,
        refId: ref?.id,
      },
    });
  });
}
export async function debit(userId: string, cost: number, type: LedgerType, ref?: Ref) {
  if (cost <= 0) throw new Error("DEBIT_MUST_BE_POSITIVE");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, coinBalance: { gte: cost } },
      data: { coinBalance: { decrement: cost } },
    });
    if (updated.count === 0) throw new InsufficientCoins();
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coinBalance: true },
    });
    return tx.coinTransaction.create({
      data: {
        userId,
        delta: -cost,
        type,
        balanceAfter: user.coinBalance,
        refType: ref?.type,
        refId: ref?.id,
      },
    });
  });
}
export async function unlockEpisode(userId: string, episodeId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const episode = await tx.episode.findUniqueOrThrow({
        where: { id: episodeId },
        include: { series: true },
      });
      const source: UnlockSource =
        episode.isFree || episode.number <= episode.series.freeEpisodeCount ? "FREE" : "COIN";
      const unlock = await tx.episodeUnlock.create({ data: { userId, episodeId, source } });
      if (source === "COIN") {
        const updated = await tx.user.updateMany({
          where: { id: userId, coinBalance: { gte: episode.coinPrice } },
          data: { coinBalance: { decrement: episode.coinPrice } },
        });
        if (!updated.count) throw new InsufficientCoins();
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { coinBalance: true },
        });
        await tx.coinTransaction.create({
          data: {
            userId,
            delta: -episode.coinPrice,
            type: "EPISODE_UNLOCK",
            balanceAfter: user.coinBalance,
            refType: "episode",
            refId: episodeId,
          },
        });
      }
      return unlock;
    });
  } catch (error) {
    // A concurrent winner owns the unique row; its transaction is complete before this lookup.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return prisma.episodeUnlock.findUniqueOrThrow({
        where: { userId_episodeId: { userId, episodeId } },
      });
    throw error;
  }
}
export async function dailyCheckin(userId: string) {
  return (await claimDailyCheckin(userId)).checkin;
}
