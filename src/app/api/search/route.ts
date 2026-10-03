import { getSchedule } from "@/lib/schedule";
import { getTimeline } from "@/lib/service-time";
import { formatServiceHeading } from "@/lib/share-services";
import { type SearchIndex, serviceAnchor } from "@/lib/site-search";
import { getLibraryData, getYearRecapData } from "@/lib/song-archive";
import { monthPdfPath } from "@/lib/song-list-pdf";
import type { Service } from "@/types/song-list";

/**
 * What the site search can find that changes with the schedule: every song with
 * a page, the services still to come, the year recaps and the month PDFs.
 * Fetched by the search palette the first time it opens (see
 * src/components/search/CommandPalette.tsx).
 *
 * Refreshed on the same cadence as the pages it points to
 * (siteConfig.songList.revalidateSeconds), so a newly scheduled song is found
 * as soon as its page exists.
 */
export const revalidate = 10;

type DatedService = Service & { date: string; startsAt: string };

export async function GET() {
  const [library, years, schedule] = await Promise.all([getLibraryData(), getYearRecapData(), getSchedule()]);
  const now = Date.now();

  // Each part stands alone: a source that cannot be read leaves its part empty.
  const months = schedule.ok ? schedule.months : [];
  const services = months
    .flatMap((month) => month.services)
    .filter((service): service is DatedService => !service.placeholder && !!service.date && !!service.startsAt);
  const timeline = getTimeline(services, now);

  const index: SearchIndex = {
    songs: library.ok
      ? library.songs.map(({ slug, title, number, sheetMusic }) => ({ slug, title, number, sheetMusic }))
      : [],
    services: services
      .filter((service) => timeline.statusOf(service.id) !== "past")
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((service) => ({
        anchor: serviceAnchor(service.date, service.slot),
        heading: formatServiceHeading(service),
        dateLabel: service.dateLabel,
        songs: service.songs.map(({ number, title }) => ({ number, title })),
      })),
    years: years.ok ? [...years.years].reverse() : [],
    // As the song list's PDF button offers them: months with a schedule to lay out.
    pdfs: months
      .filter((month) => !month.fallbackRows && month.services.some((service) => !service.placeholder))
      .map((month) => ({ month: month.title, href: monthPdfPath(month.title) })),
  };

  return Response.json(index);
}
