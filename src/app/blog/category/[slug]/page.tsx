import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Route } from "next";
import BlogPostCard from "@/components/blog/post-card";
import { JsonLd } from "@/components/json-ld";
import { SeoFieldsSchema } from "@/lib/seo";
import { resolveRedirect } from "@/server/cms";
import { prisma } from "@/server/db";
import { publicContentWhere } from "@/server/publishing";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { blogCollectionSchema, breadcrumbList } from "@/server/structured-data";

function redirectTo(target: { toPath: string; permanent: boolean }) {
  if (target.permanent) permanentRedirect(target.toPath as Route);
  redirect(target.toPath as Route);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await prisma.blogCategory.findUnique({ where: { slug: decodeURIComponent(slug) } });
  if (!category) return {};
  const seo = SeoFieldsSchema.safeParse(category.seo);
  return buildMetadata({
    kind: "category",
    path: `/blog/category/${category.slug}`,
    title: category.name,
    excerpt: category.description,
    seo: seo.success ? seo.data : undefined,
  });
}

export default async function BlogCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const category = await prisma.blogCategory.findUnique({ where: { slug } });
  if (!category) {
    const target = await resolveRedirect(`/blog/category/${slug}`).catch(() => null);
    if (target) redirectTo(target);
    notFound();
  }
  const posts = await prisma.blogPost.findMany({
    where: { ...publicContentWhere(), categoryId: category.id },
    include: { category: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", url: `${SITE_ORIGIN}/` },
    { name: "Blog", url: `${SITE_ORIGIN}/blog` },
    { name: category.name, url: `${SITE_ORIGIN}/blog/category/${category.slug}` },
  ]);
  const collection = blogCollectionSchema({
    name: category.name,
    description: category.description || `Posts in ${category.name}`,
    url: `${SITE_ORIGIN}/blog/category/${category.slug}`,
    posts: posts.map((post) => ({ title: post.title, url: `${SITE_ORIGIN}/blog/${post.slug}` })),
  });
  return (
    <main className="px-5 py-10">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={collection} />
      <Link href={"/blog" as Route} className="text-sm text-zinc-400">← Blog</Link>
      <h1 className="mt-4 text-4xl font-black">{category.name}</h1>
      {category.description && <p className="mt-2 text-zinc-400">{category.description}</p>}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
      </div>
      {!posts.length && <p className="mt-8 text-zinc-400">No published posts in this category.</p>}
    </main>
  );
}
