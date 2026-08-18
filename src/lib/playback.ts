export function selectPlaybackMode(
  isHls: boolean,
  hlsSupported: boolean,
  nativeHlsSupported: boolean,
) {
  if (!isHls) return "mp4" as const;
  if (hlsSupported) return "hls.js" as const;
  if (nativeHlsSupported) return "native-hls" as const;
  return "unsupported" as const;
}
