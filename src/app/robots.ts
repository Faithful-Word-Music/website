import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The contact endpoint is not a page; keep it out of crawl budgets.
      disallow: "/api/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
