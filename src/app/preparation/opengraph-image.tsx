import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { renderOgCard } from "@/lib/og";

const copy = recordingsContent.preparation;

export const alt = `${copy.metaTitle} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({ title: copy.metaTitle, subtitle: siteConfig.name });
}
