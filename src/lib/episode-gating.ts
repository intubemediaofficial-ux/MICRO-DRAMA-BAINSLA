export type PlaybackAccessState = "entitled" | "locked" | "anonymous";
export type PaywallHref = `/subscribe?episode=${string}`;

export function paywallRedirectDecision(
  episodeId: string,
  access: PlaybackAccessState,
):
  | { destination: "watch"; href: `/watch/${string}` }
  | { destination: "paywall"; href: PaywallHref } {
  if (access === "entitled") return { destination: "watch", href: `/watch/${episodeId}` };
  return {
    destination: "paywall",
    href: `/subscribe?episode=${encodeURIComponent(episodeId)}`,
  };
}
