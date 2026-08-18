import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const input = z.object({
  title: z.string().min(1),
  imageUrl: z.string().min(1),
  targetSeriesId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(await prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Banner lookup failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    return NextResponse.json(
      await prisma.banner.create({ data: input.parse(await request.json()) }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Banner creation failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const data = z.object({ id: z.string(), data: input.partial() }).parse(await request.json());
    return NextResponse.json(
      await prisma.banner.update({ where: { id: data.id }, data: data.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Banner update failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await adminSession();
    const { id } = z.object({ id: z.string() }).parse(await request.json());
    await prisma.banner.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Banner deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}
