import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/server/rate-limit";
const input = z.object({ identifier: z.string().min(3).max(120) });
export async function POST(request: Request) { if (!rateLimit("auth:" + request.headers.get("x-forwarded-for"), 10)) return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 }); try { input.parse(await request.json()); return NextResponse.json({ ok: true, dev: true }); } catch { return NextResponse.json({ error: { message: "Invalid identifier" } }, { status: 400 }); } }
