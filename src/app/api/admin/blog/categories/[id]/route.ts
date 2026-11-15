import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SeoFieldsSchema } from "@/lib/seo";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  seo: z.unknown().nullable().optional(),
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SEO" ? 400
        : message === "P2002" ? 409 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = patchSchema.parse(await request.json());
    let seo: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
    if (data.seo !== undefined) {
      if (data.seo === null) seo = Prisma.DbNull;
      else {
        const parsed = SeoFieldsSchema.safeParse(data.seo);
        if (!parsed.success) throw new Error("INVALID_SEO");
        seo = parsed.data as Prisma.InputJsonValue;
      }
    }
    const category = await prisma.blogCategory.update({
      where: { id },
      data: {
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(seo !== undefined ? { seo } : {}),
      },
    });
    return NextResponse.json({ category });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid category" } }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return errorResponse(new Error(error.code), "Category update failed");
    return errorResponse(error, "Category update failed");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    await prisma.blogCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Category deletion failed");
  }
}
