import { getTheme } from "@/server/site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const theme = await getTheme();
  // Relative Location keeps the public host behind the reverse proxy.
  return new Response(null, { status: 307, headers: { Location: theme.faviconUrl || "/icon.svg" } });
}
