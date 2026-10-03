/**
 * Application-level shapes for the congregational song list.
 *
 * These types deliberately describe the SONG SCHEDULE, not where it is kept.
 * The schedule is built in the Service Planner and stored in the database
 * (src/lib/service-planner/), and reaches every page through the schedule
 * read layer (src/lib/schedule.ts) - the presentation layer only ever sees
 * these types.
 */

/** A single song in a service. */
export interface Song {
  /** Hymnal number, or null for songs printed without one (Psalms, choruses). */
  number: string | null;
  title: string;
  /** Musical key chosen for this service, e.g. "Ab", "C Dorian". */
  key: string | null;
  /** The week's insert (a Psalm or other song) rather than one of the service's own picks. */
  insert?: boolean;
}

/** Morning or evening. Every service is one of these on its date. */
export type ServiceSlot = "AM" | "PM";

/** One service (one date and time) and the songs sung in it. */
export interface Service {
  /** Stable key: the service's anchor, "2026-09-06-am" (see serviceAnchor()). */
  id: string;
  /** The date written out, e.g. "Sunday, September 6, 2026". */
  dateLabel: string;
  /** "Morning Service" / "Evening Service", or a special service's own name ("Missions Conference"). */
  serviceLabel: string | null;
  slot: ServiceSlot | null;
  /** Calendar date in church time, "2026-09-06". null if the label has no readable date. */
  date: string | null;
  /** Start instant with the church's UTC offset, "2026-09-06T10:30:00-07:00". */
  startsAt: string | null;
  songs: Song[];
  /**
   * Song places published but not filled in yet. Shown as "To be announced"
   * on upcoming services; never counted as songs.
   */
  pendingSongs: number;
  /**
   * Where those unfilled places sit among the service's songs (0-based, songs
   * and places counted together), so a song already chosen for the third place
   * shows third. Missing means "after the songs". Read through serviceSlots().
   */
  pendingPositions?: number[];
  /**
   * Not published yet: a regular service whose songs are still being
   * planned, shown so a month always lists every service. Has no songs;
   * never shared, printed or counted as history. See buildScheduleMonths().
   */
  placeholder?: boolean;
}

/** One calendar month of the schedule. */
export interface SongListMonth {
  /** The tab label, e.g. "September" ("January 2027" for another year). */
  title: string;
  /** The printed heading, e.g. "September Song List". */
  heading: string | null;
  services: Service[];
  /**
   * Rows to show as a plain table when a month cannot be laid out as
   * services. Only the retired spreadsheet ever produced these.
   */
  fallbackRows: string[][] | null;
}

/** A service that can be placed in time - the unit of song history. */
export interface DatedService {
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  songs: Song[];
  /** A special service's name ("Missions Conference"); absent for a regular service. */
  label?: string | null;
  /** "special" for a service outside the weekly pattern; absent or "regular" otherwise. */
  kind?: "regular" | "special";
}

export type SongListErrorReason =
  /** DATABASE_URL is not set in this environment. */
  | "not-configured"
  /** The database could not be reached. */
  | "unavailable";

export type SongListResult =
  | {
      ok: true;
      /** What the schedule shows: this month, then each later month with a published service. */
      months: SongListMonth[];
      /** Every published service, past and future: the raw material for song history. */
      published: DatedService[];
    }
  | { ok: false; reason: SongListErrorReason };

/** Every time one song has been sung, gathered from the whole history. */
export interface SongRecord {
  /** Normalized title used to group spellings, see songKey(). */
  id: string;
  /** Title as most recently written. */
  title: string;
  /** Most recent hymnal number, if it has ever had one. */
  number: string | null;
  /** Each time it was sung, oldest first. */
  plays: Array<{ startsAt: string; slot: ServiceSlot; key: string | null }>;
}
