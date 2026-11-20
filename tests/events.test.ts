import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { POST } from "@/app/api/events/route";

describe("analytics event ingestion", () => {
  it("rejects names outside the allowlist and batches over 50", async () => {
    const invalidName = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [{ name: "secret_dump" }] }),
      }),
    );
    expect(invalidName.status).toBe(400);

    const tooMany = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: Array.from({ length: 51 }, () => ({ name: "app_open" })) }),
      }),
    );
    expect(tooMany.status).toBe(400);
  });
});
