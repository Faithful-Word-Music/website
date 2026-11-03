import { getPreparation } from "@/lib/recordings/load";
import { getSchedule } from "@/lib/schedule";
import { datedServices, nextServiceListenHref, pickNextService } from "@/lib/search/next-service";
import { getTimeline } from "@/lib/service-time";
import { formatServiceHeading } from "@/lib/share-services";
import { type SearchIndex, serviceAnchor } from "@/lib/site-search";
import { getLibraryData, getYearRecapData } from "@/lib/song-archive";
import { monthPdfPath } from "@/lib/song-list-pdf";

/**
 * What the site search can find that changes with the schedule: every song with
 * a page, the services still to come, the year recaps and the month PDFs -
 * and the next service, for the next-service commands (its Preparation
 * Playlist, when there is one). Public facts only: everything here is on a
 * public page already. The person's own sheet music for that service is
 * fetched privately, from /api/account/next-service.
 * Fetched by the search palette the first time it opens (see
 * src/components/search/CommandPalette.tsx).
 *
 * Refreshed on the same cadence as the song list
 * (siteConfig.songList.revalidateSeconds), and at once when the Service
 * Planner publishes, so a newly scheduled song is found as soon as its page
 * exists.
 */
export const revalidate = 300;

export async function GET() {
  // getPreparation is the cached, public-only read the playlist pages use: it never wakes the database for a visitor.
  const [library, years, schedule, preparation] = await Promise.all([
    getLibraryData(),
    getYearRecapData(),
    getSchedule(),
    getPreparation().catch(() => null),
  ]);
  const now = Date.now();

  // Each part stands alone: a source that cannot be read leaves its part empty.
  const months = schedule.ok ? schedule.months : [];
  const services = datedServices(months);
  const timeline = getTimeline(services, now);
  const next = pickNextService(services, now);

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
    nextService: next
      ? {
          anchor: serviceAnchor(next.service.date, next.service.slot),
          heading: formatServiceHeading(next.service),
          listenHref: nextServiceListenHref(next.service, next.status, preparation),
        }
      : null,
  };

  return Response.json(index);
}
