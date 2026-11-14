import type { MetadataRoute } from "next";
import { prisma } from "@/server/db";
import { publicSeriesWhere } from "@/server/publishing";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://intubedrama.com";
  const series = await prisma.series.findMany({
    where: publicSeriesWhere,
    select: { slug: true, createdAt: true },
  });
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, changeFrequency: "weekly", priority: 0.5 },
    ...["privacy", "terms", "refund-policy", "contact", "account/delete"].map((path) => ({
      url: `${base}/${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
    ...series.map((item) => ({
      url: `${base}/series/${encodeURIComponent(item.slug)}`,
      lastModified: item.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
