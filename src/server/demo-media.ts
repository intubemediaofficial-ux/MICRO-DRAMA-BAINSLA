export const demoMedia = [
  { slug: "second-chance-cafe", title: "SECOND CHANCE CAFE", hls: false },
  { slug: "room-404", title: "ROOM 404", hls: true },
  { slug: "crimson-promises", title: "CRIMSON PROMISES", hls: false },
  { slug: "contract-marriage", title: "CONTRACT MARRIAGE", hls: false },
  { slug: "midnight-metro", title: "MIDNIGHT METRO", hls: false },
  { slug: "rain-never-lies", title: "RAIN NEVER LIES", hls: false },
  { slug: "the-last-monsoon", title: "THE LAST MONSOON", hls: false },
  { slug: "heiress-in-hiding", title: "HEIRESS IN HIDING", hls: false },
  { slug: "vow-of-ashes", title: "VOW OF ASHES", hls: false },
] as const;

export function isPlaceholderVideo(value: string) {
  return value === "sample.mp4" || value === "/media/sample.mp4";
}
