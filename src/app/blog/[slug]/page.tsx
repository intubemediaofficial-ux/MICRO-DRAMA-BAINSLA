import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Route } from "next";
import BlogPostCard from "@/components/blog/post-card";
import CmsHtml from "@/components/cms-html";
import { JsonLd } from "@/components/json-ld";
import { SeoFieldsSchema } from "@/lib/seo";
import { resolveRedirect } from "@/server/cms";
import { findPublicBlogPost, parseSeoFields } from "@/server/blog-content";
import { prisma } from "@/server/db";
import { publicContentWhere } from "@/server/publishing";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { getSeoGlobal } from "@/server/site-config";
import { articleSchema, breadcrumbList, faqPageSchema, schemaTypeFor } from "@/server/structured-data";

function redirectTo(target: { toPath: string; permanent: boolean }) {
  if (target.permanent) permanentRedirect(target.toPath as Route);
  redirect(target.toPath as Route);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await findPublicBlogPost(decodeURIComponent(slug));
  if (!post) return {};
  const seo = parseSeoFields(post.seo);
  return buildMetadata({
    kind: "post",
    path: `/blog/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt,
    image: post.featuredImage,
    seo,
    publishedAt: post.publishedAt,
    modifiedAt: post.updatedAt,
    vars: { category: post.category?.name },
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const post = await findPublicBlogPost(slug);
  if (!post) {
    const target = await resolveRedirect(`/blog/${slug}`).catch(() => null);
    if (target) redirectTo(target);
    notFound();
  }

  const [global, related] = await Promise.all([
    getSeoGlobal(),
    prisma.blogPost.findMany({
      where: {
        ...publicContentWhere(),
        ...(post.categoryId ? { categoryId: post.categoryId } : {}),
        id: { not: post.id },
      },
      include: { category: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 3,
    }),
  ]);
  const seoResult = SeoFieldsSchema.safeParse(post.seo);
  const seo = seoResult.success ? seoResult.data : {};
  const schemaType = schemaTypeFor("post", seo.schemaType);
  const url = `${SITE_ORIGIN}/blog/${post.slug}`;
  const breadcrumbs = breadcrumbList([
    { name: "Home", url: `${SITE_ORIGIN}/` },
    { name: "Blog", url: `${SITE_ORIGIN}/blog` },
    ...(post.category ? [{ name: post.category.name, url: `${SITE_ORIGIN}/blog/category/${post.category.slug}` }] : []),
    { name: seo.breadcrumbTitle || post.title, url },
  ]);
  const description = seo.description || post.excerpt || global.defaultDescription;
  const entitySchema = schemaType === "None"
    ? null
    : schemaType === "FAQPage" && seo.faq?.length
      ? faqPageSchema(seo.faq)
      : articleSchema({
          type: schemaType === "Article" || schemaType === "NewsArticle" ? schemaType : "BlogPosting",
          title: post.title,
          description,
          url,
          image: post.featuredImage,
          publishedAt: post.publishedAt,
          modifiedAt: post.updatedAt,
          organizationName: global.organization.name,
          organizationLogo: global.organization.logo || undefined,
        });

  return (
    <article className="mx-auto max-w-4xl px-5 py-10">
      <JsonLd data={breadcrumbs} />
      {entitySchema && <JsonLd data={entitySchema} />}
      <nav aria-label="Breadcrumbs" className="mb-6 text-sm text-zinc-500">
        <Link href={"/" as Route}>Home</Link> <span aria-hidden="true">/</span> <Link href={"/blog" as Route}>Blog</Link>
        {post.category && <> <span aria-hidden="true">/</span> <Link href={`/blog/category/${post.category.slug}` as Route}>{post.category.name}</Link></>}
      </nav>
      {post.featuredImage && (
        <Image
          src={post.featuredImage}
          alt={post.title}
          width={1200}
          height={675}
          unoptimized
          className="mb-8 aspect-video w-full rounded-2xl object-cover"
        />
      )}
      {post.category && <Link href={`/blog/category/${post.category.slug}` as Route} className="text-sm font-semibold text-rose-300">{post.category.name}</Link>}
      <h1 className="mt-2 text-4xl font-black">{post.title}</h1>
      <p className="mt-3 text-sm text-zinc-500">
        {post.publishedAt?.toLocaleDateString("en-US", { dateStyle: "long" })} · {post.readingMinutes} min read
      </p>
      <div className="my-6 flex gap-4 text-sm">
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="text-rose-300">Share on X</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="text-rose-300">Share on Facebook</a>
      </div>
      <CmsHtml html={post.contentHtml} />
      {post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Link key={tag} href={`/blog/tag/${encodeURIComponent(tag)}` as Route} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
              #{tag}
            </Link>
          ))}
        </div>
      )}
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">Related posts</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((item) => <BlogPostCard key={item.id} post={item} />)}
          </div>
        </section>
      )}
    </article>
  );
}
