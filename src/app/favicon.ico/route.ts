import { NextResponse } from "next/server";
import { getTheme } from "@/server/site-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const theme = await getTheme();
  return NextResponse.redirect(new URL(theme.faviconUrl || "/icon.svg", request.url), 307);
}
