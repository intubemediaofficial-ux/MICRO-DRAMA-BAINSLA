import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";

const member = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).nullable().optional(),
  photo: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().nonnegative(),
});
const payload = z.object({ members: z.array(member).max(50) });

async function syncCastNames(tx: Prisma.TransactionClient, seriesId: string) {
  const members = await tx.castMember.findMany({ where: { seriesId }, orderBy: { sortOrder: "asc" } });
  await tx.series.update({ where: { id: seriesId }, data: { castNames: members.map((item) => item.name) } });
  return members;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    return NextResponse.json(await prisma.castMember.findMany({ where: { seriesId: id }, orderBy: { sortOrder: "asc" } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cast lookup failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await adminSession();
    const { id } = await params;
    const data = payload.parse(await request.json());
    const members = await prisma.$transaction(async (tx) => {
      await tx.castMember.deleteMany({ where: { seriesId: id } });
      for (const item of data.members)
        await tx.castMember.create({
          data: { seriesId: id, name: item.name, role: item.role ?? null, photo: item.photo ?? null, sortOrder: item.sortOrder },
        });
      return syncCastNames(tx, id);
    });
    return NextResponse.json({ members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cast save failed";
    return NextResponse.json({ error: { message } }, { status: message === "FORBIDDEN" ? 403 : 400 });
  }
}
