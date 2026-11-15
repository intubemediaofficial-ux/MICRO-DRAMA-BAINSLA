import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { analyzeSeo } from "@/lib/seo-analysis";
import { SeoFieldsSchema } from "@/lib/seo";
import { BUILTIN_PAGES } from "@/lib/builtin-pages";
import { adminSession } from "@/server/admin";
import { assertCmsSlug } from "@/server/cms";
import {
  contentFields,
  emptyContentJson,
  publicationDate,
  sanitizedContentHtml,
  sanitizedSeo,
} from "@/server/cms-content";
import { prisma } from "@/server/db";

const createSchema = z.object({
  ...contentFields,
  template: z.enum(["default", "wide"]).default("default"),
  customizeBuiltIn: z.boolean().optional(),
});

function seoScore(page: { title: string; slug: string; contentHtml: string; seo: unknown }) {
  const seo = SeoFieldsSchema.safeParse(page.seo);
  return analyzeSeo({
    kind: "page",
    title: page.title,
    seoTitle: seo.success ? seo.data.title : undefined,
    description: seo.success ? seo.data.description ?? "" : "",
    slug: page.slug,
    html: page.contentHtml,
    focusKeyword: seo.success ? seo.data.focusKeyword : undefined,
  }).score;
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SLUG" || message === "RESERVED_SLUG" || message === "INVALID_SEO"
        || message === "SCHEDULE_DATE_REQUIRED" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET() {
  try {
    await adminSession();
    const pages = await prisma.contentPage.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json({
      pages: pages.map((page) => ({ ...page, seoScore: seoScore(page) })),
      builtIns: Object.entries(BUILTIN_PAGES).map(([slug, page]) => ({ slug, ...page })),
    });
  } catch (error) {
    return errorResponse(error, "Page lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    const session = await adminSession();
    const input = createSchema.parse(await request.json());
    assertCmsSlug(input.slug, input.customizeBuiltIn);
    const seo = sanitizedSeo(input.seo);
    const page = await prisma.contentPage.create({
      data: {
        slug: input.slug,
        title: input.title,
        contentJson: input.contentJson as Prisma.InputJsonValue ?? emptyContentJson,
        contentHtml: sanitizedContentHtml(input.contentHtml),
        excerpt: input.excerpt ?? null,
        featuredImage: input.featuredImage ?? null,
        template: input.template,
        status: input.status,
        publishedAt: publicationDate(input.status, input.publishedAt),
        authorId: session.userId,
        ...(seo !== undefined ? { seo } : {}),
      },
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid page" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Page creation failed");
    return errorResponse(error, "Page creation failed");
  }
}
