import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const item = z.object({
  railKey: z.enum(["hero-1", "hero-2", "hero-3", "for-you", "trending", "new-releases"]),
  position: z.number().int().nonnegative(),
  seriesId: z.string().nullable().optional(),
  bannerUrl: z.string().trim().max(500).nullable().optional(),
});

export async function GET() {
  try {
    await adminSession();
    const items = await prisma.homeRailItem.findMany({
      orderBy: [{ railKey: "asc" }, { position: "asc" }],
      include: { series: { select: { id: true, slug: true, title: true, posterUrl: true } } },
    });
    return NextResponse.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load home curation";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function PUT(request: Request) {
  try {
    await adminSession();
    const items = z.object({ items: z.array(item).max(200) }).parse(await request.json()).items;
    const seriesIds = items.flatMap((entry) => (entry.seriesId ? [entry.seriesId] : []));
    const railSeriesKeys = items.flatMap((entry) =>
      entry.seriesId ? [`${entry.railKey}:${entry.seriesId}`] : [],
    );
    if (new Set(railSeriesKeys).size !== railSeriesKeys.length) {
      throw new Error("Each series can appear only once in a rail.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.homeRailItem.deleteMany();
      if (items.length) await tx.homeRailItem.createMany({ data: items });
    });
    return NextResponse.json(
      await prisma.homeRailItem.findMany({
        orderBy: [{ railKey: "asc" }, { position: "asc" }],
        include: { series: { select: { id: true, slug: true, title: true, posterUrl: true } } },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save home curation";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
