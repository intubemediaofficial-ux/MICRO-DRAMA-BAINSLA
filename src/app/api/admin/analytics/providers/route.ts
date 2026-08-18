import { NextResponse } from "next/server";
import { getProviderSuccessRates } from "@/server/analytics";
import { adminSession } from "@/server/admin";

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json({ providers: await getProviderSuccessRates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider analytics unavailable";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
