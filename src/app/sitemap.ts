import type { MetadataRoute } from "next";
import { BUILTIN_PAGES } from "@/lib/builtin-pages";
import { SeoFieldsSchema } from "@/lib/seo";
import { prisma } from "@/server/db";
import { publicContentWhere, publicEpisodeWhere, publicSeriesWhere } from "@/server/publishing";
import { getSeoGlobal } from "@/server/site-config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://intubedrama.com";
  const seo = await getSeoGlobal();
  const [pages, posts, categories, series, episodes] = await Promise.all([
    seo.sitemap.pages
      ? prisma.contentPage.findMany({
          where: publicContentWhere(),
          select: { slug: true, updatedAt: true, seo: true },
        })
      : Promise.resolve([]),
    seo.sitemap.posts
      ? prisma.blogPost.findMany({
          where: publicContentWhere(),
          select: { slug: true, updatedAt: true, seo: true },
        })
      : Promise.resolve([]),
    seo.sitemap.categories
      ? prisma.blogCategory.findMany({
          where: { posts: { some: publicContentWhere() } },
          select: {
            slug: true,
            seo: true,
            posts: {
              where: publicContentWhere(),
              select: { updatedAt: true },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    seo.sitemap.series
      ? prisma.series.findMany({
          where: publicSeriesWhere,
          select: { slug: true, createdAt: true, seo: true },
        })
      : Promise.resolve([]),
    seo.sitemap.episodes
      ? prisma.episode.findMany({
          where: { ...publicEpisodeWhere, series: { isPublished: true } },
          select: { id: true, publishedAt: true, seo: true },
        })
      : Promise.resolve([]),
  ]);
  const isNoindex = (value: unknown) => {
    const parsed = SeoFieldsSchema.safeParse(value);
    return parsed.success && parsed.data.noindex === true;
  };
  const builtinSlugs = new Set(Object.keys(BUILTIN_PAGES));
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...(!seo.noindexSearch ? [{ url: `${base}/search`, changeFrequency: "weekly" as const, priority: 0.5 }] : []),
    ...(seo.sitemap.posts ? [{ url: `${base}/blog`, changeFrequency: "daily" as const, priority: 0.7 }] : []),
    ...(seo.sitemap.pages
      ? [
          ...Object.keys(BUILTIN_PAGES).map((path) => ({
            url: `${base}/${path}`,
            changeFrequency: "yearly" as const,
            priority: 0.3,
          })),
          { url: `${base}/account/delete`, changeFrequency: "yearly" as const, priority: 0.3 },
        ]
      : [{ url: `${base}/account/delete`, changeFrequency: "yearly" as const, priority: 0.3 }]),
    ...pages.filter((item) => !isNoindex(item.seo) && !builtinSlugs.has(item.slug)).map((item) => ({
      url: `${base}/${encodeURIComponent(item.slug)}`,
      lastModified: item.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...posts.filter((item) => !isNoindex(item.seo)).map((item) => ({
      url: `${base}/blog/${encodeURIComponent(item.slug)}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...categories.filter((item) => !isNoindex(item.seo)).map((item) => ({
      url: `${base}/blog/category/${encodeURIComponent(item.slug)}`,
      ...(item.posts[0] ? { lastModified: item.posts[0].updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...series.filter((item) => !isNoindex(item.seo)).map((item) => ({
      url: `${base}/series/${encodeURIComponent(item.slug)}`,
      lastModified: item.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...episodes.filter((item) => !isNoindex(item.seo)).map((item) => ({
      url: `${base}/watch/${encodeURIComponent(item.id)}`,
      ...(item.publishedAt ? { lastModified: item.publishedAt } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
