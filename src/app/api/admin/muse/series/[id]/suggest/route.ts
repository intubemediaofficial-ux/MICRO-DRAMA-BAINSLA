import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { suggestSeriesDetails } from "@/server/muse";
import { allowMuseRequest } from "@/server/muse-rate-limit";
import { museErrorResponse, museRateLimitResponse } from "@/server/muse-route";

const inputSchema = z.object({
  language: z.enum(["hi", "en", "hinglish"]),
  hint: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await adminSession();
    if (!allowMuseRequest(admin.userId)) return museRateLimitResponse();
    const { id } = await params;
    const input = inputSchema.parse(await request.json().catch(() => null));
    const suggestion = await suggestSeriesDetails({ seriesId: id, ...input });
    return NextResponse.json({ suggestion });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: { message: "Invalid request." } },
        { status: 400 },
      );
    return museErrorResponse(error);
  }
}
