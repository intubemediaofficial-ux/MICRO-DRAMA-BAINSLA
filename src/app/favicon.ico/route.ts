import { getTheme } from "@/server/site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const theme = await getTheme();
  // Relative Location keeps the public host behind the reverse proxy.
  const target = (theme.faviconUrl || "/icon.svg").replace(/[^\x00-\x7F]/gu, encodeURIComponent);
  return new Response(null, { status: 307, headers: { Location: target } });
}
