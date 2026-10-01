import { siteConfig } from "@/config/site";
import { renderOgCard } from "@/lib/og";

export const alt = `Account Settings - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return renderOgCard({ title: "Account Settings", subtitle: siteConfig.name });
}
