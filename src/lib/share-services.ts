import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime, splitDateLabel } from "@/lib/service-time";
import type { Service } from "@/types/song-list";

/**
 * Services as plain text, for sending in a message or an email:
 *
 *   Sunday, September 27 · Morning, 10:30 AM
 *   114  The Great Physician (Eb)
 *   How Great Thou Art (Bb)
 *
 *   Songs and Keys are subject to change
 *   https://faithfulwordmusic.com/song-list
 *
 * Plain text because it reads the same in every app, with nothing to open.
 * Numbers are not padded into a column: message apps use proportional
 * fonts, where padding spaces never line up anyway.
 */

/** Where the shared text points back to. */
export const SONG_LIST_URL = `${siteConfig.url}/song-list`;

/** "Sunday, September 27", or the date as the sheet wrote it. */
export function serviceDate(service: Service): string {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  if (weekday && day) return `${weekday}, ${day}`;
  return service.dateLabel || songListContent.undatedServiceLabel;
}

/**
 * "Sunday, September 27, Morning" - enough to tell a Sunday's two services
 * apart, for the names of the buttons that act on one.
 */
export function serviceName(service: Service): string {
  const slot = service.slot ? songListContent.share.slotNames[service.slot] : null;
  return slot ? `${serviceDate(service)}, ${slot}` : serviceDate(service);
}

/** "Sunday, September 27 · Morning, 10:30 AM" */
export function formatServiceHeading(service: Service): string {
  const slot = service.slot ? songListContent.share.slotNames[service.slot] : null;
  const time = service.startsAt ? formatChurchTime(service.startsAt) : null;
  const when = [slot, time].filter(Boolean).join(", ");
  return when ? `${serviceDate(service)} · ${when}` : serviceDate(service);
}

function formatService(service: Service): string {
  const songs = service.songs.map((song) => {
    const title = song.key ? `${song.title} (${song.key})` : song.title;
    return song.number ? `${song.number}  ${title}` : title;
  });
  const pending = Array.from(
    { length: service.pendingSongs },
    () => songListContent.states.pendingSong,
  );
  return [formatServiceHeading(service), ...songs, ...pending].join("\n");
}

/** Services in date order - the order they happen, not the order they were picked. */
export function inDateOrder(services: Service[]): Service[] {
  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => {
      const at = a.service.startsAt ? Date.parse(a.service.startsAt) : NaN;
      const bt = b.service.startsAt ? Date.parse(b.service.startsAt) : NaN;
      // Undated services keep their place relative to each other, after the dated ones.
      if (Number.isNaN(at) || Number.isNaN(bt)) {
        if (Number.isNaN(at) && Number.isNaN(bt)) return a.index - b.index;
        return Number.isNaN(at) ? 1 : -1;
      }
      return at - bt || a.index - b.index;
    })
    .map(({ service }) => service);
}

/** The whole message: each service, then the sheet's note, then the link. */
export function formatServicesText(
  services: Service[],
  { note, url = SONG_LIST_URL }: { note?: string | null; url?: string } = {},
): string {
  const blocks = inDateOrder(services).map(formatService);
  const footer = [note, url].filter(Boolean).join("\n");
  return [...blocks, footer].filter(Boolean).join("\n\n");
}

/**
 * Email subject and share-sheet title: "Songs for Sunday, September 27" - also
 * for a Sunday's morning and evening together - or "Songs for 3 services".
 */
export function shareTitle(services: Service[]): string {
  const { titleOne, titleMany } = songListContent.share;
  const dates = new Set(services.map(serviceDate));
  if (dates.size === 1) return titleOne.replace("{date}", serviceDate(services[0]));
  return titleMany.replace("{count}", String(services.length));
}
