import { BUILTIN_PAGES, type BuiltInPageSlug } from "@/lib/builtin-pages";
import { SeoFieldsSchema } from "@/lib/seo";
import { prisma } from "./db";
import { getSession } from "./auth";
import { publicContentWhere } from "./publishing";
import { sanitizeContentHtml } from "./sanitize-html";

export async function findPublicContentPage(slug: string) {
  return prisma.contentPage.findFirst({
    where: { slug, ...publicContentWhere() },
  });
}

export async function getBuiltInPage(slug: BuiltInPageSlug, preview = false) {
  const fallback = BUILTIN_PAGES[slug];
  const session = preview ? await getSession() : null;
  const customized = preview && session?.role === "ADMIN"
    ? await prisma.contentPage.findUnique({ where: { slug } })
    : await findPublicContentPage(slug);
  const parsedSeo = SeoFieldsSchema.safeParse(customized?.seo);
  return {
    slug,
    title: customized?.title ?? fallback.title,
    html: sanitizeContentHtml(customized?.contentHtml ?? fallback.html),
    excerpt: customized?.excerpt ?? null,
    featuredImage: customized?.featuredImage ?? null,
    seo: parsedSeo.success ? parsedSeo.data : undefined,
    updatedAt: customized?.updatedAt ?? null,
    preview: Boolean(preview && session?.role === "ADMIN" && customized?.status !== "PUBLISHED"),
  };
}
