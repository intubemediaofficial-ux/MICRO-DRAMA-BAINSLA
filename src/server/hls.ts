import path from "node:path";

export function protectedSegmentUrl(token: string, key: string) {
  return `/api/stream/${token}?path=${encodeURIComponent(key)}`;
}

export function rewriteHlsManifest(manifest: string, token: string, hlsPath: string) {
  const directory = path.posix.dirname(hlsPath.replace(/^\/media\//, ""));
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      if (!line || line.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const key = path.posix.normalize(path.posix.join(directory, uri));
          return `URI="${protectedSegmentUrl(token, key)}"`;
        });
      }
      const key = path.posix.normalize(path.posix.join(directory, line));
      return protectedSegmentUrl(token, key);
    })
    .join("\n");
}
