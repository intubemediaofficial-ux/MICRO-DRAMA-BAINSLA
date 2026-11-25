import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

describe("referral middleware matcher", () => {
  it("does not match API routes", () => {
    expect(config.matcher).toEqual(["/((?!api/|_next/static|_next/image|favicon.ico).*)"]);
  });
});
