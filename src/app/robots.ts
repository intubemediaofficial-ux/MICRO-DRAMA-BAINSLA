import type { MetadataRoute } from "next";
import { buildRobotsMetadata } from "@/lib/robots";
import { SITE_ORIGIN } from "@/server/seo";
import { getSeoGlobal } from "@/server/site-config";

export default async function robots(): Promise<MetadataRoute.Robots> {
  return buildRobotsMetadata(await getSeoGlobal(), SITE_ORIGIN);
}
