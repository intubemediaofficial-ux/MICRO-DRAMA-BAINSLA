import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

export type BlogCardPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  readingMinutes: number;
  category?: { name: string; slug: string } | null;
};

export default function BlogPostCard({ post }: { post: BlogCardPost }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
      <Link href={`/blog/${post.slug}` as Route} className="block">
        {post.featuredImage && (
          <Image
            src={post.featuredImage}
            alt={post.title}
            width={900}
            height={560}
            unoptimized
            className="aspect-[16/9] w-full object-cover"
          />
        )}
        <div className="p-4">
          {post.category && <p className="text-xs font-semibold text-rose-300">{post.category.name}</p>}
          <h2 className="mt-1 text-lg font-bold">{post.title}</h2>
          {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{post.excerpt}</p>}
          <p className="mt-3 text-xs text-zinc-500">
            {post.publishedAt?.toLocaleDateString("en-US", { dateStyle: "medium" }) ?? "Draft"} · {post.readingMinutes} min read
          </p>
        </div>
      </Link>
    </article>
  );
}
