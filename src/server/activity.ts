import { prisma } from "./db";

export function recordUserActivityDay(userId: string, at = new Date()) {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  return prisma.userActivityDay.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day },
    update: {},
  });
}
