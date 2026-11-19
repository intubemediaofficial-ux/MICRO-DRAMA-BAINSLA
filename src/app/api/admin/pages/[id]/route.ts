import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { assertCmsSlug, BUILT_IN_PAGE_SLUGS, saveSlugRedirect } from "@/server/cms";
import { contentFieldsPatch, publicationDate, sanitizedContentHtml, sanitizedSeo } from "@/server/cms-content";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  ...contentFieldsPatch,
  template: z.enum(["default", "wide"]).optional(),
  customizeBuiltIn: z.boolean().optional(),
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SLUG" || message === "RESERVED_SLUG" || message === "INVALID_SEO"
        || message === "SCHEDULE_DATE_REQUIRED" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const page = await prisma.contentPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: { message: "Page not found" } }, { status: 404 });
    return NextResponse.json({ page });
  } catch (error) {
    return errorResponse(error, "Page lookup failed");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    const existing = await prisma.contentPage.findUnique({
      where: { id },
      select: { slug: true, status: true, publishedAt: true },
    });
    if (!existing) return NextResponse.json({ error: { message: "Page not found" } }, { status: 404 });
    if (data.slug !== undefined) {
      const isExistingBuiltIn = data.slug === existing.slug && BUILT_IN_PAGE_SLUGS.has(existing.slug);
      assertCmsSlug(data.slug, data.customizeBuiltIn || isExistingBuiltIn);
    }

    const status = data.status ?? existing.status;
    const publishedAt = data.publishedAt === undefined ? existing.publishedAt : data.publishedAt;
    const seo = data.seo === undefined ? undefined : sanitizedSeo(data.seo);
    const contentHtml = data.contentHtml === undefined
      ? undefined
      : sanitizedContentHtml(data.contentHtml);
    const updated = await prisma.$transaction(async (tx) => {
      const page = await tx.contentPage.update({
        where: { id },
        data: {
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.contentJson !== undefined
            ? { contentJson: data.contentJson as Prisma.InputJsonValue }
            : {}),
          ...(contentHtml !== undefined ? { contentHtml } : {}),
          ...(data.excerpt !== undefined ? { excerpt: data.excerpt } : {}),
          ...(data.featuredImage !== undefined ? { featuredImage: data.featuredImage } : {}),
          ...(data.template !== undefined ? { template: data.template } : {}),
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
        await saveSlugRedirect(tx, `/${existing.slug}`, `/${data.slug}`);
      }
      return page;
    });
    return NextResponse.json({ page: updated });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid page" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Page update failed");
    return errorResponse(error, "Page update failed");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    await prisma.contentPage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Page deletion failed");
  }
}
