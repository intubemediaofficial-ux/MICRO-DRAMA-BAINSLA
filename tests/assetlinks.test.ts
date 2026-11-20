import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({ ANDROID_CERT_SHA256: "aa:bb, cc:dd" }),
}));

import { GET } from "@/app/.well-known/assetlinks.json/route";

describe("Android asset links", () => {
  it("serves the configured package and fingerprints as JSON", async () => {
    const response = await GET();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.intubemedia.reels",
          sha256_cert_fingerprints: ["aa:bb", "cc:dd"],
        },
      },
    ]);
  });
});
