import { NextResponse } from "next/server";
import { getRevenueMetrics } from "@/server/analytics";
import { adminSession } from "@/server/admin";

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json(await getRevenueMetrics());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revenue unavailable";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
