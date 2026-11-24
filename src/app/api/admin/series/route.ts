import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
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
  publishOnFirstReady: z.boolean(),
  seo: z.unknown().nullable().optional(),
});

const createSeriesInput = z.object({
  slug: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || undefined)
    .optional()
    .refine((value) => value === undefined || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)),
  title: z.string().trim().min(1),
  synopsis: z.string().default(""),
  posterUrl: z.string().default(""),
  teaserUrl: z.string().default(""),
  genres: z.array(z.string()).default([]),
  tropeTags: z.array(z.string()).default([]),
  castNames: z.array(z.string()).default([]),
  freeEpisodeCount: z.number().int().nonnegative().default(5),
  defaultCoinPrice: z.number().int().positive().default(10),
  isPublished: z.boolean().optional(),
  status: z.enum(["ONGOING", "COMPLETED"]).default("ONGOING"),
  publishOnFirstReady: z.boolean().default(false),
  seo: z.unknown().nullable().optional(),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

async function nextAvailableSlug(base: string) {
  for (let suffix = 1; ; suffix += 1) {
    const ending = suffix === 1 ? "" : `-${suffix}`;
    const slug = `${base.slice(0, 80 - ending.length).replace(/-+$/g, "")}${ending}`;
    const existing = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = createSeriesInput.parse(await request.json());
    const seo = sanitizedSeo(data.seo);
    const { seo: _seo, isPublished: _isPublished, ...seriesData } = data;
    const baseSlug =
      data.slug ||
      slugify(data.title) ||
      `series-${randomBytes(4).toString("hex").slice(0, 6)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = await nextAvailableSlug(baseSlug);
      try {
        const series = await prisma.$transaction(async (tx) => {
          const created = await tx.series.create({
            data: {
              ...seriesData,
              slug,
              isPublished: false,
              ...(seo !== undefined ? { seo } : {}),
            },
          });
          await tx.season.create({
            data: { seriesId: created.id, number: 1, title: "Season 1", sortOrder: 0 },
          });
          return created;
        });
        return NextResponse.json(series, { status: 201 });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
      }
    }
    throw new Error("A unique series slug could not be generated.");
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
