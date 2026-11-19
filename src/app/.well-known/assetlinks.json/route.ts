import { NextResponse } from "next/server";
import { getSettings } from "@/server/settings";

export async function GET() {
  const settings = await getSettings();
  const fingerprints =
    settings.ANDROID_CERT_SHA256?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.intubemedia.reels",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
