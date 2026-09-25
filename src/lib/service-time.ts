import { siteConfig } from "@/config/site";
import type { ServiceSlot } from "@/types/song-list";

/**
 * Everything about WHEN a service happens. Pure functions only - no clock is
 * read in here; callers pass `now` in, which is what makes this testable and
 * lets the browser and server agree.
 *
 * Every service becomes an absolute instant ("2026-09-20T18:00:00-07:00"), so
 * "Next" and "Now" are correct for a visitor in any timezone: the service
 * starts at the same moment for everyone, only the clock reading differs.
 */

const { serviceTimes, serviceDurationMinutes, timeZone, utcOffset } = siteConfig.songList;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const DAY_MS = 86_400_000;

/** "-07:00" -> -420 minutes. */
function offsetMinutes(offset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

const CHURCH_OFFSET_MS = offsetMinutes(utcOffset) * 60_000;

/**
 * "Wednesday, September 2, 2026" -> "2026-09-02".
 *
 * Read by month name rather than handed to `new Date()`, whose parsing of such
 * strings varies between engines. The weekday word is ignored: the date itself
 * is the truth, and a typo in the weekday should not lose the service.
 */
export function parseDateLabel(label: string): string | null {
  const match = /([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(label);
  if (!match) return null;

  const monthIndex = MONTHS.findIndex((name) =>
    name.startsWith(match[1].toLowerCase().slice(0, 3)),
  );
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (monthIndex < 0 || day < 1 || day > 31) return null;

  // Reject impossible dates such as February 30.
  const check = new Date(Date.UTC(year, monthIndex, day));
  if (check.getUTCMonth() !== monthIndex) return null;

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "AM", "pm", "A.M." -> "AM" / "PM"; anything else -> null. */
export function parseSlot(value: string): ServiceSlot | null {
  const normalized = value.replace(/[.\s]/g, "").toUpperCase();
  return normalized === "AM" || normalized === "PM" ? normalized : null;
}

/** 0 = Sunday. `date` is "YYYY-MM-DD". */
export function dayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The start instant of a service, as an ISO string in church time. */
export function startsAtFor(date: string, slot: ServiceSlot): string {
  const times = dayOfWeek(date) === 0 ? serviceTimes.sunday : serviceTimes.otherDay;
  return `${date}T${times[slot]}:00${utcOffset}`;
}

/** Whole days since the epoch, counted on the church's calendar. */
export function churchDay(instant: number): number {
  return Math.floor((instant + CHURCH_OFFSET_MS) / DAY_MS);
}

/** The church-calendar year of an instant. */
export function churchYear(instant: number): number {
  return new Date(instant + CHURCH_OFFSET_MS).getUTCFullYear();
}

export type ServiceStatus = "past" | "now" | "next" | "upcoming" | "unknown";

export interface Timeline {
  /** The service currently in progress, if any. */
  nowId: string | null;
  /** The next service to start. It stays "next" right up to its start time. */
  nextId: string | null;
  statusOf: (id: string) => ServiceStatus;
}

/**
 * Places every service relative to `now`:
 *
 *   before its start           -> "next" (the earliest such) or "upcoming"
 *   from start to start + 90m  -> "now"
 *   after that                 -> "past"
 *
 * The moment a service starts it stops being "next", and the one after it
 * takes over - even while the first is still "now".
 */
export function getTimeline(
  services: ReadonlyArray<{ id: string; startsAt: string | null }>,
  now: number,
): Timeline {
  const durationMs = serviceDurationMinutes * 60_000;
  const statuses = new Map<string, ServiceStatus>();
  let next: { id: string; start: number } | null = null;
  let current: { id: string; start: number } | null = null;

  for (const service of services) {
    const start = service.startsAt ? Date.parse(service.startsAt) : NaN;
    if (Number.isNaN(start)) {
      statuses.set(service.id, "unknown");
      continue;
    }

    if (start > now) {
      statuses.set(service.id, "upcoming");
      if (!next || start < next.start) next = { id: service.id, start };
    } else if (now < start + durationMs) {
      statuses.set(service.id, "now");
      // Two overlapping "now"s cannot really happen; prefer the later start.
      if (!current || start > current.start) current = { id: service.id, start };
    } else {
      statuses.set(service.id, "past");
    }
  }

  if (next) statuses.set(next.id, "next");
  if (current) {
    for (const [id, status] of statuses) {
      if (status === "now" && id !== current.id) statuses.set(id, "past");
    }
  }

  return {
    nowId: current?.id ?? null,
    nextId: next?.id ?? null,
    statusOf: (id) => statuses.get(id) ?? "unknown",
  };
}

const churchClock = new Intl.DateTimeFormat("en-US", {
  timeZone,
  hour: "numeric",
  minute: "2-digit",
});

/** "6:00 PM", read on the church's clock. */
export function formatChurchTime(startsAt: string): string {
  return churchClock.format(new Date(startsAt));
}

/** "6:00 PM" on the visitor's own clock. Browser only: depends on the device timezone. */
export function formatLocalTime(startsAt: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(startsAt),
  );
}

/** Whether the visitor's device keeps a different clock from the church at that instant. */
export function isDifferentClock(startsAt: string): boolean {
  const instant = new Date(startsAt);
  return -instant.getTimezoneOffset() * 60_000 !== CHURCH_OFFSET_MS;
}

const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const longDate = new Intl.DateTimeFormat("en-US", {
  timeZone,
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Sun, Sep 27" */
export function formatShortDate(startsAt: string): string {
  return shortDate.format(new Date(startsAt));
}

/** "Sep 27, 2026" */
export function formatLongDate(startsAt: string): string {
  return longDate.format(new Date(startsAt));
}

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/**
 * How long until a service starts: "in 25 minutes", "in 3 hours", "tomorrow",
 * "in 4 days". Minutes and hours are exact; beyond that it counts calendar
 * days, which is how people talk about services ("Sunday is in 3 days").
 */
export function formatCountdown(startsAt: string, now: number): string {
  const start = Date.parse(startsAt);
  const minutes = Math.max(1, Math.round((start - now) / 60_000));

  if (minutes < 60) return relative.format(minutes, "minute");
  if (churchDay(start) === churchDay(now) || minutes < 6 * 60) {
    return relative.format(Math.round(minutes / 60), "hour");
  }
  return relative.format(churchDay(start) - churchDay(now), "day");
}

/**
 * How long ago something happened, in calendar terms: "earlier today",
 * "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "2 years ago".
 */
export function formatAgo(instant: number, now: number): string {
  const days = churchDay(now) - churchDay(instant);

  if (days <= 0) return "earlier today";
  if (days < 14) return relative.format(-days, "day");
  if (days < 63) return relative.format(-Math.round(days / 7), "week");
  if (days < 730) return relative.format(-Math.round(days / 30.44), "month");
  return relative.format(-Math.round(days / 365.25), "year");
}

/** "Sunday, September 6, 2026" -> { weekday: "Sunday", day: "September 6" }. */
export function splitDateLabel(label: string): { weekday: string | null; day: string | null } {
  const match = /^\s*([A-Za-z]+),\s*([A-Za-z]+\.?\s+\d{1,2})(?:,\s*\d{4})?\s*$/.exec(label);
  return match ? { weekday: match[1], day: match[2] } : { weekday: null, day: null };
}

const dayDate = new Intl.DateTimeFormat("en-US", {
  timeZone,
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "Sunday, September 6" - for lists already grouped by year. */
export function formatDayDate(startsAt: string): string {
  return dayDate.format(new Date(startsAt));
}
