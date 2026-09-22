import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { renderOgCard } from "@/lib/og";

export const alt = `${songListContent.title} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({
    title: songListContent.title,
    subtitle: siteConfig.name,
  });
}
