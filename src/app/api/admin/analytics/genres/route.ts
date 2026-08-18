import { NextResponse } from "next/server";
import { getTopGenres } from "@/server/analytics";
import { adminSession } from "@/server/admin";

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json({ genres: await getTopGenres() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Genre analytics unavailable";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
