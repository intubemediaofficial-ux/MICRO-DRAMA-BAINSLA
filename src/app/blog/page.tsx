import Link from "next/link";
import type { Route } from "next";
import BlogPostCard from "@/components/blog/post-card";
import { JsonLd } from "@/components/json-ld";
import { prisma } from "@/server/db";
import { publicContentWhere } from "@/server/publishing";
import { buildMetadata, SITE_ORIGIN } from "@/server/seo";
import { blogCollectionSchema, breadcrumbList } from "@/server/structured-data";

const PAGE_SIZE = 12;

export async function generateMetadata() {
  return buildMetadata({
    kind: "category",
    path: "/blog",
    title: "Blog",
    excerpt: "Stories, news, and behind-the-scenes updates from Intube Drama.",
  });
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = publicContentWhere();
  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      include: { category: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.blogPost.count({ where }),
  ]);
  const baseCrumb = breadcrumbList([
    { name: "Home", url: `${SITE_ORIGIN}/` },
    { name: "Blog", url: `${SITE_ORIGIN}/blog` },
  ]);
  const blogSchema = blogCollectionSchema({
    name: "Intube Drama Blog",
    description: "Stories, news, and behind-the-scenes updates from Intube Drama.",
    url: `${SITE_ORIGIN}/blog`,
    posts: posts.map((post) => ({ title: post.title, url: `${SITE_ORIGIN}/blog/${post.slug}` })),
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="px-5 py-10">
      <JsonLd data={baseCrumb} />
      <JsonLd data={blogSchema} />
      <div className="mb-8">
        <Link href={"/" as Route} className="text-sm text-zinc-400">← Home</Link>
        <h1 className="mt-4 text-4xl font-black">Blog</h1>
        <p className="mt-2 text-zinc-400">Stories, news, and behind-the-scenes updates.</p>
      </div>
      {posts.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-zinc-900 p-6 text-zinc-400">No published posts yet.</p>
      )}
      {pageCount > 1 && (
        <nav aria-label="Blog pagination" className="mt-8 flex justify-center gap-4 text-sm">
          {page > 1 && <Link href={`/blog?page=${page - 1}` as Route} className="text-rose-300">← Newer posts</Link>}
          <span className="text-zinc-500">Page {page} of {pageCount}</span>
          {page < pageCount && <Link href={`/blog?page=${page + 1}` as Route} className="text-rose-300">Older posts →</Link>}
        </nav>
      )}
    </main>
  );
}
