import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { getSettings } from "@/server/settings";

export async function POST() {
  try {
    await adminSession();
    const settings = await getSettings();
    const apiKey = settings.MUSE_API_KEY?.trim();
    if (!apiKey)
      return NextResponse.json(
        { ok: false, message: "Save a Muse API key first." },
        { status: 400 },
      );

    const response = await fetch("https://api.meta.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response)
      return NextResponse.json(
        { ok: false, message: "Could not reach Muse. Try again later." },
        { status: 502 },
      );
    if (response.status === 401 || response.status === 403)
      return NextResponse.json(
        { ok: false, message: "Muse rejected the saved API key." },
        { status: 400 },
      );
    if (!response.ok)
      return NextResponse.json(
        { ok: false, message: "Muse could not complete the request. Try again." },
        { status: 502 },
      );
    return NextResponse.json({ ok: true, message: "Muse API key is valid." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        message:
          status === 401 || status === 403 ? message : "Muse key test failed.",
      },
      { status },
    );
  }
}
