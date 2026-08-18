import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
const input = z.object({ episodeId: z.string() });
export async function POST(request: Request) { const session = await getSession(); if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 }); try { const { episodeId } = input.parse(await request.json()); const existing = await prisma.episodeLike.findUnique({ where: { userId_episodeId: { userId: session.userId, episodeId } } }); if (existing) await prisma.episodeLike.delete({ where: { id: existing.id } }); else await prisma.episodeLike.create({ data: { userId: session.userId, episodeId } }); return NextResponse.json({ liked: !existing }); } catch { return NextResponse.json({ error: { message: "Invalid episode" } }, { status: 400 }); } }
