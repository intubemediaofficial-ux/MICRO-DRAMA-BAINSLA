import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const seriesInput = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  synopsis: z.string(),
  posterUrl: z.string(),
  teaserUrl: z.string(),
  genres: z.array(z.string()),
  tropeTags: z.array(z.string()),
  castNames: z.array(z.string()),
  freeEpisodeCount: z.number().int().nonnegative(),
  defaultCoinPrice: z.number().int().positive(),
  isPublished: z.boolean(),
  status: z.enum(["ONGOING", "COMPLETED"]).default("ONGOING"),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = seriesInput.parse(await request.json());
    const series = await prisma.$transaction(async (tx) => {
      const created = await tx.series.create({ data });
      await tx.season.create({
        data: { seriesId: created.id, number: 1, title: "Season 1", sortOrder: 0 },
      });
      return created;
    });
    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid series";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await adminSession();
    const payload = z
      .object({ id: z.string(), data: seriesInput.partial() })
      .parse(await request.json());
    return NextResponse.json(
      await prisma.series.update({ where: { id: payload.id }, data: payload.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid series";
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
    const history = await prisma.episodeUnlock.count({ where: { episode: { seriesId: id } } });
    if (history) throw new Error("SERIES_HAS_PAID_HISTORY");
    await prisma.series.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Series deletion failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : message === "SERIES_HAS_PAID_HISTORY" ? 409 : 400 },
    );
  }
}
