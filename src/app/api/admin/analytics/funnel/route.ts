import { NextResponse } from "next/server";
import { getSeriesFunnel } from "@/server/analytics";
import { adminSession } from "@/server/admin";

export async function GET(request: Request) {
  try {
    await adminSession();
    const seriesId = new URL(request.url).searchParams.get("seriesId");
    if (!seriesId)
      return NextResponse.json({ error: { message: "seriesId is required" } }, { status: 400 });
    return NextResponse.json({ seriesId, funnel: await getSeriesFunnel(seriesId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Funnel unavailable";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
