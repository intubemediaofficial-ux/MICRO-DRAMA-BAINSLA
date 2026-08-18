import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
const input = z.object({ episodeId: z.string(), positionSec: z.number().int().nonnegative(), completed: z.boolean().optional() });
export async function POST(request: Request) { const session = await getSession(); if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 }); try { const data = input.parse(await request.json()); const progress = await prisma.watchProgress.upsert({ where: { userId_episodeId: { userId: session.userId, episodeId: data.episodeId } }, update: { positionSec: data.positionSec, completed: data.completed ?? false }, create: { userId: session.userId, episodeId: data.episodeId, positionSec: data.positionSec, completed: data.completed ?? false } }); return NextResponse.json(progress); } catch { return NextResponse.json({ error: { message: "Invalid progress" } }, { status: 400 }); } }
