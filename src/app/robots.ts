import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Endpoints are not pages, and the members' area is private: keep them
      // out of crawl budgets. (The pages also say noindex themselves.)
      disallow: ["/api/", "/admin", "/account", "/profile", "/dashboard", "/availability", "/accept-invite", "/login"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
