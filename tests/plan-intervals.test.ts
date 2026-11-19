import { describe, expect, it } from "vitest";
import { addInterval, intervalLabel } from "@/server/subscriptions";

describe("plan intervals", () => {
  const start = new Date("2026-01-31T10:00:00.000Z");

  it("adds one month, clamping to the last day of shorter months", () => {
    expect(addInterval(start, "MONTHLY").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addInterval(new Date("2026-03-15T00:00:00.000Z"), "MONTHLY").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });

  it("adds six months for half-yearly plans", () => {
    expect(addInterval(start, "HALF_YEARLY").toISOString()).toBe("2026-07-31T10:00:00.000Z");
    expect(addInterval(new Date("2026-08-31T00:00:00.000Z"), "HALF_YEARLY").toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("adds one year for annual plans", () => {
    expect(addInterval(start, "ANNUAL").toISOString()).toBe("2027-01-31T10:00:00.000Z");
    expect(addInterval(new Date("2028-02-29T00:00:00.000Z"), "ANNUAL").toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });

  it("labels each interval", () => {
    expect(intervalLabel("MONTHLY")).toBe("month");
    expect(intervalLabel("HALF_YEARLY")).toBe("6 months");
    expect(intervalLabel("ANNUAL")).toBe("year");
  });
});
