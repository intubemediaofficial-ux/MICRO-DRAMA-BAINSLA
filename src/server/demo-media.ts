export const demoMedia = [
  { slug: "second-chance-cafe", title: "SECOND CHANCE CAFE", hls: false },
  { slug: "room-404", title: "ROOM 404", hls: true },
  { slug: "crimson-promises", title: "CRIMSON PROMISES", hls: false },
] as const;

export function isPlaceholderVideo(value: string) {
  return value === "sample.mp4" || value === "/media/sample.mp4";
}
