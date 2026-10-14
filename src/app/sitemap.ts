import type { MetadataRoute } from "next";
import { env } from "@/server/config";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL;
  const series = await prisma.series.findMany({
    where: { isPublished: true },
    select: { slug: true, createdAt: true },
  });
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "weekly", priority: 0.5 },
    ...series.map((item) => ({
      url: `${base}/series/${encodeURIComponent(item.slug)}`,
      lastModified: item.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
