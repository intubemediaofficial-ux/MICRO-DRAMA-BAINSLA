import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SeoFieldsSchema } from "@/lib/seo";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const inputSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  seo: z.unknown().nullable().optional(),
});

function parsedSeo(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  const parsed = SeoFieldsSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_SEO");
  return parsed.data as Prisma.InputJsonValue;
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SEO" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET() {
  try {
    await adminSession();
    const categories = await prisma.blogCategory.findMany({
      include: { _count: { select: { posts: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return errorResponse(error, "Category lookup failed");
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = inputSchema.parse(await request.json());
    const seo = parsedSeo(data.seo);
    const category = await prisma.blogCategory.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        ...(seo !== undefined ? { seo } : {}),
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid category" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Category creation failed");
    return errorResponse(error, "Category creation failed");
  }
}
