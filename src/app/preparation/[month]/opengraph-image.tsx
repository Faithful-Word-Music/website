import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { renderOgCard } from "@/lib/og";
import { monthTitle } from "@/lib/schedule-months";

const copy = recordingsContent.preparation;

export const alt = `${copy.metaTitle} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** "November Preparation Playlist", on the site's usual card. Read off the address alone. */
export default async function OpengraphImage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const title = valid ? copy.monthTitle.replace("{month}", monthTitle(month, Number(month.slice(0, 4)))) : copy.metaTitle;
  return renderOgCard({ title, subtitle: siteConfig.name });
}
