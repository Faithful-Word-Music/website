import { siteConfig } from "@/config/site";
import { conductorContent } from "@/content/conductor";
import { renderOgCard } from "@/lib/og";

export const alt = `${conductorContent.name} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({ title: conductorContent.name, subtitle: siteConfig.name });
}
