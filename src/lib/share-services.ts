import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime, splitDateLabel } from "@/lib/service-time";
import type { Service } from "@/types/song-list";

/**
 * Services as plain text, for sending in a message or an email:
 *
 *   Sunday Morning · Sept 27 · 10:30 AM
 *
 *   #114  The Great Physician – Eb
 *   –  How Great Thou Art – Bb
 *
 *   https://faithfulwordmusic.com/song-list
 *
 * Plain text because it reads the same in every app, with nothing to open.
 * Every song line starts the same way - "#number", or a dash for songs
 * without one - so the list scans cleanly. Numbers are not padded into a
 * column: message apps use proportional fonts, where padding never lines up.
 */

/**
 * The most services shared at once - a Sunday's two and the Wednesday after,
 * at most. It keeps the picture phone-screen sized; the page's select mode
 * and the picture route both hold to it.
 */
export const MAX_SHARED_SERVICES = 3;

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

/** Short month names, newspaper style: "Sept", not Intl's "Sep". */
const SHORT_MONTHS: Record<string, string> = {
  January: "Jan",
  February: "Feb",
  March: "Mar",
  April: "Apr",
  May: "May",
  June: "June",
  July: "July",
  August: "Aug",
  September: "Sept",
  October: "Oct",
  November: "Nov",
  December: "Dec",
};

/** "September 27" -> "Sept 27". Anything else is left as written. */
function shortDay(day: string): string {
  const [month, ...rest] = day.split(" ");
  const short = SHORT_MONTHS[month];
  return short ? [short, ...rest].join(" ") : day;
}

/** "Sunday Morning · Sept 27 · 10:30 AM" */
export function formatServiceHeading(service: Service): string {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const slot = service.slot ? songListContent.share.slotNames[service.slot] : null;
  const time = service.startsAt ? formatChurchTime(service.startsAt) : null;
  const parts =
    weekday && day
      ? [slot ? `${weekday} ${slot}` : weekday, shortDay(day), time]
      : [serviceDate(service), slot, time];
  return parts.filter(Boolean).join(" · ");
}

/** "#114  The Great Physician – Eb", or "–  How Great Thou Art – Bb" without a number. */
function formatSong(number: string | null, title: string, key: string | null): string {
  const lead = number ? `#${number}` : "–";
  return key ? `${lead}  ${title} – ${key}` : `${lead}  ${title}`;
}

function formatService(service: Service): string {
  const songs = service.songs.map((song) => formatSong(song.number, song.title, song.key));
  const pending = Array.from({ length: service.pendingSongs }, () =>
    formatSong(null, songListContent.states.pendingSong, null),
  );
  return [formatServiceHeading(service), "", ...songs, ...pending].join("\n");
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

/** The whole message: each service in date order, then the link on its own. */
export function formatServicesText(
  services: Service[],
  { url = SONG_LIST_URL }: { url?: string } = {},
): string {
  const blocks = inDateOrder(services).map(formatService);
  return [...blocks, url].filter(Boolean).join("\n\n");
}

/**
 * Email subject, share-sheet title and picture filename: "Songs for Sunday,
 * September 27" - also for a Sunday's morning and evening together - or
 * "Songs for 3 services".
 */
export function shareTitle(services: Service[]): string {
  const { titleOne, titleMany } = songListContent.share;
  const dates = new Set(services.map(serviceDate));
  if (dates.size === 1) return titleOne.replace("{date}", serviceDate(services[0]));
  return titleMany.replace("{count}", String(services.length));
}
