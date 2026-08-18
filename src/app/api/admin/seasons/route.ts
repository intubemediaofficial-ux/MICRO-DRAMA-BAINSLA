import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const seasonInput = z.object({
  seriesId: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export async function GET(request: Request) {
  try {
    await adminSession();
    const seriesId = new URL(request.url).searchParams.get("seriesId");
    if (!seriesId) return NextResponse.json({ error: { message: "seriesId is required" } }, { status: 400 });
    const seasons = await prisma.season.findMany({
      where: { seriesId },
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
      include: { _count: { select: { episodes: true } } },
    });
    return NextResponse.json({ seasons });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season request failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = seasonInput.parse(await request.json());
    const series = await prisma.series.findUnique({ where: { id: data.seriesId }, select: { id: true } });
    if (!series) return NextResponse.json({ error: { message: "Series not found" } }, { status: 404 });
    let season;
    try {
      season = await prisma.season.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: { message: `Season number ${data.number} already exists in this series` } },
          { status: 409 },
        );
      }
      throw error;
    }
    return NextResponse.json({ season }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season creation failed";
    return NextResponse.json({
      error: { message },
    }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
