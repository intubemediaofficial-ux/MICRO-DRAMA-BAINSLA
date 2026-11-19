import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { saveSlugRedirect } from "@/server/cms";
import { sanitizedSeo } from "@/server/cms-content";
import { prisma } from "@/server/db";
import { publicEpisodeWhere } from "@/server/publishing";

const seriesInput = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
  seo: z.unknown().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = seriesInput.parse(await request.json());
    const seo = sanitizedSeo(data.seo);
    const { seo: _seo, ...seriesData } = data;
    const series = await prisma.$transaction(async (tx) => {
      const created = await tx.series.create({
        data: { ...seriesData, isPublished: false, ...(seo !== undefined ? { seo } : {}) },
      });
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
    const existing = await prisma.series.findUnique({
      where: { id: payload.id },
      select: { isPublished: true, slug: true },
    });
    if (payload.data.isPublished === true && !existing?.isPublished) {
      const episode = await prisma.episode.findFirst({
        where: { seriesId: payload.id, ...publicEpisodeWhere },
        select: { id: true },
      });
      if (!episode)
        return NextResponse.json(
          {
            error: {
              message: "Publish at least one episode with a video file before publishing the series.",
            },
          },
          { status: 400 },
        );
    }
    const seo = payload.data.seo === undefined ? undefined : sanitizedSeo(payload.data.seo);
    const { seo: _seo, ...seriesData } = payload.data;
    const updated = await prisma.$transaction(async (tx) => {
      const series = await tx.series.update({
        where: { id: payload.id },
        data: { ...seriesData, ...(seo !== undefined ? { seo } : {}) },
      });
      if (payload.data.slug && payload.data.slug !== existing?.slug && existing?.isPublished)
        await saveSlugRedirect(tx, `/series/${existing.slug}`, `/series/${payload.data.slug}`);
      return series;
    });
    return NextResponse.json(updated);
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
