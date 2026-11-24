import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { generatePoster } from "@/server/muse";
import { allowMuseRequest } from "@/server/muse-rate-limit";
import { museErrorResponse, museRateLimitResponse } from "@/server/muse-route";

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(1_500),
  seriesId: z.string().trim().min(1).max(128).optional(),
  title: z
    .string()
    .max(20_000)
    .transform((value) => value.trim().slice(0, 160).trim())
    .optional(),
  synopsis: z
    .string()
    .max(20_000)
    .transform((value) => value.trim().slice(0, 4_000).trim())
    .optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await adminSession();
    if (!allowMuseRequest(admin.userId)) return museRateLimitResponse();
    const input = inputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await generatePoster(input));
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: { message: "Invalid request." } },
        { status: 400 },
      );
    return museErrorResponse(error);
  }
}
