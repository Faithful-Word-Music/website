import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/** Generated from siteConfig.nav, so adding a route to the nav adds it here. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return siteConfig.nav.map((item) => ({
    url: new URL(item.href, siteConfig.url).toString(),
    lastModified,
    changeFrequency: item.href === "/song-list" ? "weekly" : "monthly",
    priority: item.href === "/" ? 1 : 0.8,
  }));
}
