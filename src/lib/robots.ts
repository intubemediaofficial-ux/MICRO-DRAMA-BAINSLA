import type { MetadataRoute } from "next";

type RobotsConfig = { robotsExtra: string };

const defaultAllow = ["/"];
const defaultDisallow = ["/admin", "/api/", "/account", "/wallet"];

function extraDirectives(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^(Allow|Disallow): (\/\S*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ directive: match[1] as "Allow" | "Disallow", path: match[2] }));
}

export function buildRobotsText(
  seo: RobotsConfig,
  siteOrigin = "https://intubedrama.com",
) {
  const allow = [...defaultAllow];
  const disallow = [...defaultDisallow];
  for (const item of extraDirectives(seo.robotsExtra)) {
    (item.directive === "Allow" ? allow : disallow).push(item.path);
  }
  return [
    "User-Agent: *",
    ...allow.map((path) => `Allow: ${path}`),
    ...disallow.map((path) => `Disallow: ${path}`),
    `Sitemap: ${siteOrigin}/sitemap.xml`,
  ].join("\n");
}

export function buildRobotsMetadata(
  seo: RobotsConfig,
  siteOrigin = "https://intubedrama.com",
): MetadataRoute.Robots {
  const lines = buildRobotsText(seo, siteOrigin).split("\n");
  const rules = lines.slice(1, -1);
  return {
    rules: {
      userAgent: "*",
      allow: rules.filter((line) => line.startsWith("Allow: ")).map((line) => line.slice(7)),
      disallow: rules.filter((line) => line.startsWith("Disallow: ")).map((line) => line.slice(10)),
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
