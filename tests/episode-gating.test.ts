import { describe, expect, it } from "vitest";
import { paywallRedirectDecision } from "../src/lib/episode-gating";
import { deriveEpisodeRailEntries } from "../src/lib/episode-rail";

describe("episode gating", () => {
  it("derives watched, locked, and current rail state", () => {
    const entries = deriveEpisodeRailEntries(
      [
        {
          id: "free",
          number: 1,
          seasonNumber: 1,
          title: "Free",
          entitled: true,
          watched: true,
        },
        {
          id: "locked",
          number: 6,
          seasonNumber: 1,
          title: "Locked",
          watched: false,
          entitled: false,
        },
      ],
      "locked",
    );

    expect(entries[0]).toMatchObject({ watched: true, locked: false, current: false });
    expect(entries[1]).toMatchObject({ watched: false, locked: true, current: true });
  });

  it("routes entitled viewers to watch and everyone else to the paywall", () => {
    expect(paywallRedirectDecision("episode-1", "entitled")).toEqual({
      destination: "watch",
      href: "/watch/episode-1",
    });
    expect(paywallRedirectDecision("episode-6", "locked")).toEqual({
      destination: "paywall",
      href: "/subscribe?episode=episode-6",
    });
    expect(paywallRedirectDecision("episode-6", "anonymous")).toEqual({
      destination: "paywall",
      href: "/subscribe?episode=episode-6",
    });
  });
});
