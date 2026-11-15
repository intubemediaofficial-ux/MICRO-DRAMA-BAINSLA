import Link from "next/link";
import type { Route } from "next";
import BlogPostCard from "@/components/blog/post-card";
import { JsonLd } from "@/components/json-ld";
import { prisma } from "@/server/db";
import { publicContentWhere } from "@/server/publishing";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { blogCollectionSchema, breadcrumbList } from "@/server/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const label = decodeURIComponent(tag);
  return buildMetadata({
    kind: "category",
    path: `/blog/tag/${encodeURIComponent(label)}`,
    title: `Posts tagged ${label}`,
    excerpt: `Blog posts tagged ${label}.`,
  });
}

export default async function BlogTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const posts = await prisma.blogPost.findMany({
    where: { ...publicContentWhere(), tags: { has: tag } },
    include: { category: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  const url = `${SITE_ORIGIN}/blog/tag/${encodeURIComponent(tag)}`;
  return (
    <main className="px-5 py-10">
      <JsonLd data={breadcrumbList([
        { name: "Home", url: `${SITE_ORIGIN}/` },
        { name: "Blog", url: `${SITE_ORIGIN}/blog` },
        { name: `Tag: ${tag}`, url },
      ])} />
      <JsonLd data={blogCollectionSchema({
        name: `Posts tagged ${tag}`,
        description: `Blog posts tagged ${tag}.`,
        url,
        posts: posts.map((post) => ({ title: post.title, url: `${SITE_ORIGIN}/blog/${post.slug}` })),
      })} />
      <Link href={"/blog" as Route} className="text-sm text-zinc-400">← Blog</Link>
      <h1 className="mt-4 text-4xl font-black">Posts tagged #{tag}</h1>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
      </div>
      {!posts.length && <p className="mt-8 text-zinc-400">No published posts with this tag.</p>}
    </main>
  );
}
