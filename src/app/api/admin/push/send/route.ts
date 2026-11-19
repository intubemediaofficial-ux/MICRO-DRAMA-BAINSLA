import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { sendFcmNotifications } from "@/server/fcm";
import { prisma } from "@/server/db";
import { publicSeriesWhere } from "@/server/publishing";

const input = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  audience: z.enum(["all", "series"]),
  seriesId: z.string().optional(),
  includeSeriesLink: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    let series: { id: string; slug: string } | null = null;
    if (data.seriesId) {
      series = await prisma.series.findFirst({
        where: { id: data.seriesId, ...publicSeriesWhere },
        select: { id: true, slug: true },
      });
      if (!series) return NextResponse.json({ error: { message: "Public series not found" } }, { status: 404 });
    }
    if (data.audience === "series" && !series)
      return NextResponse.json({ error: { message: "Choose a public series" } }, { status: 400 });
    let userIds: string[] | undefined;
    if (data.audience === "series" && series) {
      const [watchlist, progress] = await Promise.all([
        prisma.watchlistItem.findMany({ where: { seriesId: series.id }, select: { userId: true } }),
        prisma.watchProgress.findMany({
          where: { episode: { seriesId: series.id } },
          select: { userId: true },
        }),
      ]);
      userIds = [...new Set([...watchlist, ...progress].map((entry) => entry.userId))];
    }
    const devices = await prisma.deviceToken.findMany({
      where: userIds ? { userId: { in: userIds } } : {},
      select: { token: true },
    });
    const result = await sendFcmNotifications(
      devices.map((device) => device.token),
      {
        title: data.title,
        body: data.body,
        ...(data.includeSeriesLink && series ? { data: { seriesSlug: series.slug } } : {}),
      },
    );
    return NextResponse.json({ ...result, audienceDevices: devices.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification could not be sent";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
