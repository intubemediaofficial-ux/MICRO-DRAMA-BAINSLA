import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { getTheme, saveTheme, THEME_DEFAULTS } from "@/server/site-config";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
      : message === "INVALID_SITE_CONFIG" ? 400 : 500;
  return NextResponse.json({ error: { message: status === 500 ? fallback : message } }, { status });
}

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json({ theme: await getTheme(), defaults: THEME_DEFAULTS });
  } catch (error) {
    return errorResponse(error, "Theme settings lookup failed");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await adminSession();
    const patch: unknown = await request.json();
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      return NextResponse.json({ error: { message: "Invalid theme settings" } }, { status: 400 });
    return NextResponse.json({ theme: await saveTheme(patch, session.userId) });
  } catch (error) {
    return errorResponse(error, "Theme settings update failed");
  }
}
