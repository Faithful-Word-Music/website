import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { renderOgCard } from "@/lib/og";
import { serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import { parseAnchor } from "@/lib/service-planner/model";
import { startsAtFor } from "@/lib/service-time";

const copy = recordingsContent.preparation;

export const alt = `${copy.metaTitle} - ${siteConfig.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** "Sunday Morning" over "Sunday, November 8, 2026", read off the address alone. */
export default async function OpengraphImage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const where = parseAnchor(service);
  if (!where) return renderOgCard({ title: copy.metaTitle, subtitle: siteConfig.name });
  const startsAt = startsAtFor(where.date, where.slot);
  return renderOgCard({ title: serviceTitle({ slot: where.slot, startsAt, label: null }), subtitle: `${serviceFullDate(startsAt)} · ${copy.metaTitle}` });
}
