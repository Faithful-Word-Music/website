import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { dayOfWeek } from "@/lib/service-time";
import { formatSongLines, SONG_LIST_URL } from "@/lib/share-services";
import type { Service, ServiceSlot, SongListMonth } from "@/types/song-list";

/**
 * The song list as a calendar feed (RFC 5545 iCalendar), served at
 * /song-list/calendar.ics. Pure functions only.
 *
 * Apple Calendar, Google Calendar and Outlook all subscribe to the same
 * address and fetch it again from time to time, so an edit in the sheet
 * reaches subscribers' calendars without them doing anything. The services
 * they want are part of the address (?services=sun-am,wed-pm), so nothing
 * about a subscriber is ever stored.
 */

/** The kinds of service a subscriber can choose between. */
export const SERVICE_KINDS = ["sun-am", "sun-pm", "wed-pm", "special"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const CALENDAR_PATH = "/song-list/calendar.ics";

/** Sunday morning and evening, Wednesday evening, and everything else. */
export function serviceKind(service: Pick<Service, "date" | "slot">): ServiceKind | null {
  if (!service.date || !service.slot) return null;
  const day = dayOfWeek(service.date);
  if (day === 0) return service.slot === "AM" ? "sun-am" : "sun-pm";
  if (day === 3 && service.slot === "PM") return "wed-pm";
  return "special";
}

/**
 * "sun-am,wed-pm" -> those kinds. Anything missing or unreadable means every
 * kind: a mistyped address should still give a calendar, not an empty one.
 */
export function parseKinds(param: string | null): Set<ServiceKind> {
  const kinds = new Set(
    (param ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is ServiceKind => (SERVICE_KINDS as readonly string[]).includes(value)),
  );
  return kinds.size > 0 ? kinds : new Set(SERVICE_KINDS);
}

/** The feed's path for these kinds - with no query at all when every kind is wanted. */
export function calendarPath(kinds: Iterable<ServiceKind>): string {
  const chosen = new Set(kinds);
  const ordered = SERVICE_KINDS.filter((kind) => chosen.has(kind));
  if (ordered.length === 0 || ordered.length === SERVICE_KINDS.length) return CALENDAR_PATH;
  return `${CALENDAR_PATH}?services=${ordered.join(",")}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sunday Morning Service", "Thursday Evening Service". */
function eventTitle(date: string, slot: ServiceSlot): string {
  return `${WEEKDAYS[dayOfWeek(date)]} ${songListContent.serviceMarkerLabels[slot]}`;
}

/** An instant as iCalendar UTC: "20260927T173000Z". */
function utcStamp(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes a TEXT value: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Folds a content line so no physical line exceeds 75 octets (RFC 5545
 * 3.1): continuation lines start with a single space. Counts UTF-8 bytes and
 * never splits a character, so "–" and accented titles survive intact.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // The first line may hold 75 octets; later ones 74, after their leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

/** The services a calendar can hold: placed in time, with at least one song or slot. */
function calendarServices(months: SongListMonth[]): Array<Service & { date: string; startsAt: string }> {
  const services = months.flatMap((month) => (month.fallbackRows ? [] : month.services));
  return services.filter(
    (service): service is Service & { date: string; startsAt: string } =>
      service.date !== null &&
      service.startsAt !== null &&
      service.songs.length + service.pendingSongs > 0,
  );
}

/**
 * The whole feed: one event per service of the chosen kinds, from the months
 * the schedule shows - recent services included, so last Sunday's songs are
 * still there to look back on.
 */
export function buildCalendar(
  months: SongListMonth[],
  kinds: ReadonlySet<ServiceKind>,
  now: number,
): string {
  const { calendar } = songListContent;
  const duration = siteConfig.songList.serviceDurationMinutes * 60_000;
  const host = new URL(siteConfig.url).hostname;
  const stamp = utcStamp(now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${siteConfig.name}//Song List//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendar.calendarName)}`,
    `X-WR-CALDESC:${escapeText(calendar.calendarDescription)}`,
    `X-WR-TIMEZONE:${siteConfig.songList.timeZone}`,
    // How often to check back. Apple and Outlook honour these; Google keeps its own pace.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const seen = new Set<string>();
  for (const service of calendarServices(months)) {
    const kind = serviceKind(service);
    if (!kind || !service.slot || !kinds.has(kind)) continue;

    // Date and slot name the service, so an edited song list updates the same event.
    const uid = `${service.date}-${service.slot}@${host}`;
    if (seen.has(uid)) continue;
    seen.add(uid);

    const start = Date.parse(service.startsAt);
    const description = [
      ...formatSongLines(service),
      "",
      calendar.eventFooter,
      "",
      SONG_LIST_URL,
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(start + duration)}`,
      `SUMMARY:${escapeText(eventTitle(service.date, service.slot))}`,
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${SONG_LIST_URL}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
