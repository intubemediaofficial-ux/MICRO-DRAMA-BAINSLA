import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { saveSlugRedirect } from "@/server/cms";
import { contentFieldsPatch, publicationDate, sanitizedContentHtml, sanitizedSeo } from "@/server/cms-content";
import { readingMinutes } from "@/lib/seo-analysis";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  ...contentFieldsPatch,
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SEO" || message === "SCHEDULE_DATE_REQUIRED" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const post = await prisma.blogPost.findUnique({ where: { id }, include: { category: true } });
    if (!post) return NextResponse.json({ error: { message: "Blog post not found" } }, { status: 404 });
    return NextResponse.json({ post });
  } catch (error) {
    return errorResponse(error, "Blog post lookup failed");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const existing = await prisma.blogPost.findUnique({
      where: { id },
      select: { slug: true, status: true, publishedAt: true },
    });
    if (!existing) return NextResponse.json({ error: { message: "Blog post not found" } }, { status: 404 });
    const status = data.status ?? existing.status;
    const publishedAt = data.publishedAt === undefined ? existing.publishedAt : data.publishedAt;
    const seo = data.seo === undefined ? undefined : sanitizedSeo(data.seo);
    const contentHtml = data.contentHtml === undefined
      ? undefined
      : sanitizedContentHtml(data.contentHtml);

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.blogPost.update({
        where: { id },
        data: {
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.contentJson !== undefined
            ? { contentJson: data.contentJson as Prisma.InputJsonValue }
            : {}),
          ...(contentHtml !== undefined
            ? { contentHtml, readingMinutes: readingMinutes(contentHtml) }
            : {}),
          ...(data.excerpt !== undefined ? { excerpt: data.excerpt } : {}),
          ...(data.featuredImage !== undefined ? { featuredImage: data.featuredImage } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          ...(data.status !== undefined || data.publishedAt !== undefined
            ? { status, publishedAt: publicationDate(status, publishedAt) }
            : {}),
          ...(seo !== undefined ? { seo } : {}),
        },
      });
      if (
        data.slug !== undefined
        && data.slug !== existing.slug
        && (existing.status === "PUBLISHED" || existing.status === "SCHEDULED")
      ) {
        await saveSlugRedirect(tx, `/blog/${existing.slug}`, `/blog/${data.slug}`);
      }
      return updated;
    });
    return NextResponse.json({ post });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid blog post" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Blog post update failed");
    return errorResponse(error, "Blog post update failed");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    await prisma.blogPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Blog post deletion failed");
  }
}
