import { NextResponse } from "next/server";

export function museErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHENTICATED")
    return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
  if (code === "FORBIDDEN")
    return NextResponse.json({ error: { message: "FORBIDDEN" } }, { status: 403 });
  if (code === "MUSE_NOT_CONFIGURED")
    return NextResponse.json(
      { error: { message: "Add your Muse API key in Admin → Settings first." } },
      { status: 400 },
    );
  if (code === "MUSE_NO_VIDEO")
    return NextResponse.json(
      { error: { message: "Upload and process at least one episode video first." } },
      { status: 400 },
    );
  if (code === "MUSE_KEY_REJECTED")
    return NextResponse.json(
      { error: { message: "Muse rejected the saved API key." } },
      { status: 400 },
    );
  if (code === "MUSE_SERIES_NOT_FOUND")
    return NextResponse.json({ error: { message: "Series not found." } }, { status: 404 });
  return NextResponse.json(
    { error: { message: "Muse could not complete the request. Try again." } },
    { status: 502 },
  );
}

export function museRateLimitResponse() {
  return NextResponse.json(
    { error: { message: "Muse request limit reached. Try again later." } },
    { status: 429, headers: { "Retry-After": "600" } },
  );
}
