import { prisma } from "./db";

export const homeRailKeys = ["hero-1", "hero-2", "hero-3", "for-you", "trending", "new-releases"] as const;

export async function getHomeCuration() {
  return prisma.homeRailItem.findMany({
    orderBy: [{ railKey: "asc" }, { position: "asc" }],
    include: {
      series: {
        include: { episodes: { orderBy: { number: "asc" }, take: 1 } },
      },
    },
  });
}
