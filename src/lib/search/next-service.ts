import type { PlaylistMonth } from "@/lib/recordings/playlist";
import { getTimeline, type ServiceStatus } from "@/lib/service-time";
import { serviceAnchor } from "@/lib/site-search";
import type { Service } from "@/types/song-list";

/**
 * Which service the next-service commands mean, and whether its Preparation
 * Playlist exists - shared by /api/search (public) and
 * /api/account/next-service (the person's own sheet music), so the two can
 * never disagree about which service is "next". Pure, for testing.
 */

export type DatedService = Service & { date: string; startsAt: string };

/** Services with a real date and start: what the timeline can place. */
export function datedServices(months: ReadonlyArray<{ services: Service[] }>): DatedService[] {
  return months
    .flatMap((month) => month.services)
    .filter((service): service is DatedService => !service.placeholder && !!service.date && !!service.startsAt);
}

/**
 * The service the commands are about: the one under way, else the next to
 * start - the same one the Song List's spotlight features. Null when nothing
 * is coming.
 */
export function pickNextService(
  services: readonly DatedService[],
  now: number,
): { service: DatedService; status: ServiceStatus } | null {
  const timeline = getTimeline(services, now);
  const id = timeline.nowId ?? timeline.nextId;
  const service = id ? services.find((candidate) => candidate.id === id) : undefined;
  return service ? { service, status: timeline.statusOf(service.id) } : null;
}

/**
 * Where to listen to a service before it: its Preparation Playlist page, or
 * null when there is nowhere real to send anyone.
 *
 * The same rule the Song List uses for its "Listen" link (ServiceCard,
 * NextServiceSpotlight): a dated service with songs that has not yet begun,
 * at /playlists/<YYYY-MM>/<anchor>. And, because the palette offers it
 * unseen, one more check: the playlist page itself must have the service -
 * the same lookup that page makes (findService in
 * src/app/playlists/[month]/[service]/page.tsx: its month, then the service
 * by id, in getPreparation()). A service the playlists do not know, or
 * playlists that could not be read, gives null.
 */
export function nextServiceListenHref(
  service: Pick<Service, "id" | "date"> & { songs: readonly unknown[] },
  status: ServiceStatus,
  preparation: { ok: boolean; months: readonly PlaylistMonth[] } | null,
): string | null {
  if (status === "now" || status === "past") return null;
  if (!service.date || service.songs.length === 0) return null;
  if (!preparation?.ok) return null;
  const month = service.date.slice(0, 7);
  const listed = preparation.months.find((item) => item.month === month)?.services.some((item) => item.id === service.id);
  return listed ? `/playlists/${month}/${service.id}` : null;
}

/** The anchor a service is known by on every page: "2026-11-08-am". */
export function anchorOf(service: Pick<Service, "date" | "slot">): string | null {
  return service.date ? serviceAnchor(service.date, service.slot) : null;
}
