import { SeoFieldsSchema } from "@/lib/seo";
import { prisma } from "./db";
import { publicContentWhere } from "./publishing";

export function parseSeoFields(value: unknown) {
  const parsed = SeoFieldsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function findPublicBlogPost(slug: string) {
  return prisma.blogPost.findFirst({
    where: { slug, ...publicContentWhere() },
    include: { category: true },
  });
}
