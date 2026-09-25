import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/**
 * Generated from siteConfig.nav, so adding a route to the nav adds it here -
 * plus the pages deliberately kept out of the nav but still worth indexing.
 */
const unlistedPages = ["/song-list/archive"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [...siteConfig.nav.map((item) => item.href), ...unlistedPages].map((href) => ({
    url: new URL(href, siteConfig.url).toString(),
    lastModified,
    changeFrequency: href.startsWith("/song-list") ? "weekly" : "monthly",
    priority: href === "/" ? 1 : 0.8,
  }));
}
