import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { createAdToken } from "@/server/tokens";
const input = z.object({ episodeId: z.string().min(1) });
export async function POST(request: Request) { const session = await getSession(); if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 }); try { const { episodeId } = input.parse(await request.json()); const episode = await prisma.episode.findUnique({ where: { id: episodeId } }); if (!episode) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 }); const token = createAdToken(session.userId, episodeId); const verified = token.split(".")[0]; const [userId, id, nonce, exp] = Buffer.from(verified, "base64url").toString().split("."); await prisma.adRewardNonce.create({ data: { nonce, userId, episodeId: id, expiresAt: new Date(Number(exp) * 1000) } }); return NextResponse.json({ token }); } catch { return NextResponse.json({ error: { message: "Invalid input" } }, { status: 400 }); } }
