import type { Metadata } from "next";
import { SeoFieldsSchema, type SeoFields, renderTitleTemplate, type TitleTemplateVariables } from "@/lib/seo";
import { getSeoGlobal } from "./site-config";

export const SITE_ORIGIN = "https://intubedrama.com";

export type SeoKind = "home" | "page" | "post" | "category" | "series" | "episode" | "search";

export async function buildMetadata(input: {
  kind: SeoKind;
  path: string;
  title: string;
  excerpt?: string | null;
  image?: string | null;
  seo?: unknown;
  vars?: TitleTemplateVariables;
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
}): Promise<Metadata> {
  const global = await getSeoGlobal();
  const parsedSeo = SeoFieldsSchema.safeParse(input.seo);
  const seo: SeoFields = parsedSeo.success ? parsedSeo.data : {};
  const template = global.titleTemplates[input.kind];
  const titleVariables: TitleTemplateVariables = {
    title: input.title,
    sitename: global.siteName,
    sep: global.separator,
    ...input.vars,
  };
  const seoTitle = seo.title ? renderTitleTemplate(seo.title, titleVariables) : "";
  const seoDescription = seo.description
    ? renderTitleTemplate(seo.description, titleVariables)
    : "";
  const absoluteTitle = seoTitle || (input.kind === "home" && global.homeTitle)
    || renderTitleTemplate(template, titleVariables);
  const description = seoDescription
    || (input.kind === "home" && global.homeDescription)
    || input.excerpt
    || global.defaultDescription;
  const canonical = seo.canonical
    ? seo.canonical.startsWith("/") ? new URL(seo.canonical, SITE_ORIGIN).toString() : seo.canonical
    : new URL(input.path, SITE_ORIGIN).toString();
  const image = seo.ogImage || input.image || global.defaultOgImage;
  const images = image ? [{ url: image }] : undefined;
  const isArticle = input.kind === "post" || input.kind === "episode";
  const robots = {
    index: !(seo.noindex || (input.kind === "search" && global.noindexSearch)),
    follow: !seo.nofollow,
  };
  const openGraph: NonNullable<Metadata["openGraph"]> = {
    type: isArticle ? "article" : "website",
    url: canonical,
    siteName: global.siteName,
    title: seo.ogTitle || absoluteTitle,
    description: seo.ogDescription || description,
    images,
    ...(isArticle && input.publishedAt ? { publishedTime: input.publishedAt.toISOString() } : {}),
    ...(isArticle && input.modifiedAt ? { modifiedTime: input.modifiedAt.toISOString() } : {}),
  };

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { absolute: absoluteTitle },
    description,
    keywords: seo.keywords,
    alternates: { canonical },
    robots,
    openGraph,
    twitter: {
      card: seo.twitterCard || "summary_large_image",
      title: seo.ogTitle || absoluteTitle,
      description: seo.ogDescription || description,
      images,
      ...(global.twitterHandle ? { site: global.twitterHandle } : {}),
    },
  };
}
