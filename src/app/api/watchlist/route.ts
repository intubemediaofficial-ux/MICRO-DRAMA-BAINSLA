import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { publicSeriesWhere } from "@/server/publishing";

const input = z.object({ seriesId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const { seriesId } = input.parse(await request.json());
    const series = await prisma.series.findFirst({
      where: { id: seriesId, ...publicSeriesWhere },
      select: { id: true },
    });
    if (!series)
      return NextResponse.json({ error: { message: "Series not found" } }, { status: 404 });
    await prisma.watchlistItem.upsert({
      where: { userId_seriesId: { userId: session.userId, seriesId } },
      create: { userId: session.userId, seriesId },
      update: {},
    });
    return NextResponse.json({ inWatchlist: true });
  } catch {
    return NextResponse.json({ error: { message: "Invalid series" } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const { seriesId } = input.parse(await request.json());
    const series = await prisma.series.findFirst({
      where: { id: seriesId, ...publicSeriesWhere },
      select: { id: true },
    });
    if (!series)
      return NextResponse.json({ error: { message: "Series not found" } }, { status: 404 });
    await prisma.watchlistItem.deleteMany({ where: { userId: session.userId, seriesId } });
    return NextResponse.json({ inWatchlist: false });
  } catch {
    return NextResponse.json({ error: { message: "Invalid series" } }, { status: 400 });
  }
}
