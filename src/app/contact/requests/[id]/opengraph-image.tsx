import { siteConfig } from "@/config/site";
import { supportContent } from "@/content/support";
import { renderOgCard } from "@/lib/og";

// The same card for every request: nothing about one ever reaches a share image.
export const alt = `${supportContent.share.title} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({ title: supportContent.share.title, subtitle: siteConfig.name });
}
