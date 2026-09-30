import { siteConfig } from "@/config/site";
import { libraryContent } from "@/content/library";
import { renderOgCard } from "@/lib/og";

export const alt = `${libraryContent.metaTitle} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({
    title: libraryContent.metaTitle,
    subtitle: siteConfig.name,
  });
}
