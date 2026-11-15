import Image from "next/image";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Route } from "next";
import CmsHtml from "@/components/cms-html";
import { JsonLd } from "@/components/json-ld";
import { SeoFieldsSchema } from "@/lib/seo";
import { getSession } from "@/server/auth";
import { resolveRedirect } from "@/server/cms";
import { prisma } from "@/server/db";
import { findPublicContentPage } from "@/server/public-cms";
import { publicContentWhere } from "@/server/publishing";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { getSeoGlobal } from "@/server/site-config";
import {
  articleSchema,
  breadcrumbList,
  faqPageSchema,
  schemaTypeFor,
  tvEpisodeSchema,
  tvSeriesSchema,
  webPageSchema,
} from "@/server/structured-data";

async function findPage(slug: string, preview: boolean) {
  const session = preview ? await getSession() : null;
  const canPreview = preview && session?.role === "ADMIN";
  if (canPreview) return prisma.contentPage.findUnique({ where: { slug } });
  return findPublicContentPage(slug);
}

function redirectTo(target: { toPath: string; permanent: boolean }) {
  if (target.permanent) permanentRedirect(target.toPath as Route);
  redirect(target.toPath as Route);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { path } = await params;
  if (path.length !== 1) return {};
  const query = await searchParams;
  const preview = query.preview === "1";
  const page = await findPage(decodeURIComponent(path[0]), preview);
  if (!page) return {};
  const parsedSeo = SeoFieldsSchema.safeParse(page.seo);
  const seo = parsedSeo.success ? parsedSeo.data : {};
  return buildMetadata({
    kind: "page",
    path: `/${page.slug}`,
    title: page.title,
    excerpt: page.excerpt,
    image: page.featuredImage,
    seo: preview ? { ...seo, noindex: true } : seo,
    modifiedAt: page.updatedAt,
  });
}

export default async function CmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const pathValue = `/${path.join("/")}`;
  const preview = query.preview === "1";
  if (path.length !== 1) {
    const target = await resolveRedirect(pathValue).catch(() => null);
    if (target) redirectTo(target);
    notFound();
  }
  const slug = decodeURIComponent(path[0]);
  const page = await findPage(slug, preview);
  if (!page) {
    const target = await resolveRedirect(pathValue).catch(() => null);
    if (target) redirectTo(target);
    notFound();
  }

  const parsedSeo = SeoFieldsSchema.safeParse(page.seo);
  const seo = parsedSeo.success ? parsedSeo.data : {};
  const [global] = await Promise.all([getSeoGlobal()]);
  const url = `${SITE_ORIGIN}/${page.slug}`;
  const crumbs = breadcrumbList([
    { name: global.siteName, url: `${SITE_ORIGIN}/` },
    { name: seo.breadcrumbTitle || page.title, url },
  ]);
  const schemaType = schemaTypeFor("page", seo.schemaType);
  const description = seo.description || page.excerpt || global.defaultDescription;
  let entitySchema: unknown = null;
  if (schemaType === "FAQPage" && seo.faq?.length) {
    entitySchema = faqPageSchema(seo.faq);
  } else if (schemaType === "Article" || schemaType === "BlogPosting" || schemaType === "NewsArticle") {
    entitySchema = articleSchema({
      type: schemaType,
      title: page.title,
      description,
      url,
      image: page.featuredImage,
      modifiedAt: page.updatedAt,
      organizationName: global.organization.name,
      organizationLogo: global.organization.logo || undefined,
    });
  } else if (schemaType === "TVSeries") {
    entitySchema = tvSeriesSchema({
      name: page.title,
      description,
      url,
      image: page.featuredImage || undefined,
    });
  } else if (schemaType === "TVEpisode") {
    entitySchema = tvEpisodeSchema({
      name: page.title,
      description,
      url,
      episodeNumber: 1,
      seriesName: global.siteName,
      seriesUrl: `${SITE_ORIGIN}/`,
      thumbnailUrl: page.featuredImage || undefined,
    });
  } else if (schemaType === "WebPage" || schemaType === "AboutPage" || schemaType === "ContactPage") {
    entitySchema = webPageSchema({ type: schemaType, title: page.title, description, url });
  }

  return (
    <article className={`mx-auto px-5 py-10 ${page.template === "wide" ? "max-w-6xl" : "max-w-3xl"}`}>
      <JsonLd data={crumbs} />
      {entitySchema !== null && schemaType !== "None" ? <JsonLd data={entitySchema} /> : null}
      {preview && <p className="mb-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">Draft preview</p>}
      {page.featuredImage && (
        <Image
          src={page.featuredImage}
          alt={page.title}
          width={1200}
          height={630}
          unoptimized
          className="mb-6 h-auto w-full rounded-2xl object-cover"
        />
      )}
      <h1 className="text-4xl font-black">{page.title}</h1>
      {page.excerpt && <p className="mt-3 text-lg text-zinc-400">{page.excerpt}</p>}
      <CmsHtml html={page.contentHtml} className="mt-8" />
    </article>
  );
}
