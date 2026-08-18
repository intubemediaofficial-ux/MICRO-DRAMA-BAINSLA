import { NextResponse } from "next/server";
import { getAnalytics } from "@/server/analytics";
import { adminSession } from "@/server/admin";

export async function GET(request: Request) {
  try {
    await adminSession();
    const seriesId = new URL(request.url).searchParams.get("seriesId") ?? undefined;
    return NextResponse.json(await getAnalytics(seriesId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics unavailable";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
