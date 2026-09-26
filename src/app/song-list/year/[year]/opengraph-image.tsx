import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { renderOgCard } from "@/lib/og";

const { yearRecap } = songListContent;

export const alt = `${yearRecap.eyebrow} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** "2026 in Song", on the site's usual card. */
export default async function OpengraphImage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const title = /^\d{4}$/.test(year) ? yearRecap.metaTitle.replace("{year}", year) : yearRecap.eyebrow;
  return renderOgCard({ title, subtitle: siteConfig.name });
}
