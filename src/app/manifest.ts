import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { PAPER } from "@/lib/og";

/**
 * /manifest.webmanifest - what makes the site installable as the
 * "Faithful Word Music" app, opening in its own window rather than a browser
 * tab. Only signed-in members are offered installing (src/lib/install.ts).
 *
 * It opens on the Dashboard: the proxy sends anyone signed out to log in
 * first, and inside the app the public site is never shown
 * (src/lib/app-only.ts). The icons are drawn from the one mark, src/app/icon.svg
 * (src/app/app-icon/[variant]/route.tsx).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: PAPER,
    theme_color: PAPER,
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
