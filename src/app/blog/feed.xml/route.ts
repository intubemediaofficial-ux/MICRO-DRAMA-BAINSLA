import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { publicContentWhere } from "@/server/publishing";
import { sanitizeContentHtml } from "@/server/sanitize-html";
import { SITE_ORIGIN } from "@/server/seo";

export const dynamic = "force-dynamic";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await prisma.blogPost.findMany({
    where: publicContentWhere(),
    include: { category: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });
  const items = posts.map((post) => {
    const url = `${SITE_ORIGIN}/blog/${post.slug}`;
    const body = sanitizeContentHtml(post.contentHtml);
    return `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(url)}</link><guid>${xmlEscape(url)}</guid><pubDate>${(post.publishedAt ?? post.updatedAt).toUTCString()}</pubDate><description>${xmlEscape(post.excerpt ?? "")}</description>${post.category ? `<category>${xmlEscape(post.category.name)}</category>` : ""}<content:encoded>${xmlEscape(body)}</content:encoded></item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Intube Drama Blog</title><link>${SITE_ORIGIN}/blog</link><description>Stories, news, and behind-the-scenes updates from Intube Drama.</description>${items}</channel></rss>`;
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
