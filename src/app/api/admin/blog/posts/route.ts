import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { analyzeSeo, readingMinutes } from "@/lib/seo-analysis";
import { SeoFieldsSchema } from "@/lib/seo";
import { adminSession } from "@/server/admin";
import { saveSlugRedirect } from "@/server/cms";
import {
  contentFields,
  publicationDate,
  sanitizedContentHtml,
  sanitizedSeo,
} from "@/server/cms-content";
import { prisma } from "@/server/db";

const createSchema = z.object({
  ...contentFields,
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
});

function seoScore(post: { title: string; slug: string; contentHtml: string; seo: unknown }) {
  const parsed = SeoFieldsSchema.safeParse(post.seo);
  return analyzeSeo({
    kind: "post",
    title: post.title,
    seoTitle: parsed.success ? parsed.data.title : undefined,
    description: parsed.success ? parsed.data.description ?? "" : "",
    slug: post.slug,
    html: post.contentHtml,
    focusKeyword: parsed.success ? parsed.data.focusKeyword : undefined,
  }).score;
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SEO" || message === "SCHEDULE_DATE_REQUIRED" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET(request: Request) {
  try {
    await adminSession();
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim();
    const status = url.searchParams.get("status");
    const posts = await prisma.blogPost.findMany({
      where: {
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }] } : {}),
        ...(status && ["DRAFT", "PUBLISHED", "SCHEDULED"].includes(status)
          ? { status: status as "DRAFT" | "PUBLISHED" | "SCHEDULED" }
          : {}),
      },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ posts: posts.map((post) => ({ ...post, seoScore: seoScore(post) })) });
  } catch (error) {
    return errorResponse(error, "Blog post lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    const session = await adminSession();
    const input = createSchema.parse(await request.json());
    const seo = sanitizedSeo(input.seo);
    const contentHtml = sanitizedContentHtml(input.contentHtml);
    const post = await prisma.blogPost.create({
      data: {
        slug: input.slug,
        title: input.title,
        contentJson: input.contentJson as Prisma.InputJsonValue,
        contentHtml,
        excerpt: input.excerpt ?? null,
        featuredImage: input.featuredImage ?? null,
        status: input.status,
        publishedAt: publicationDate(input.status, input.publishedAt),
        authorId: session.userId,
        categoryId: input.categoryId ?? null,
        tags: input.tags,
        readingMinutes: readingMinutes(contentHtml),
        ...(seo !== undefined ? { seo } : {}),
      },
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid blog post" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Blog post creation failed");
    return errorResponse(error, "Blog post creation failed");
  }
}
