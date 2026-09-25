/**
 * Application-level shapes for the congregational song list.
 *
 * These types deliberately describe the SONG SCHEDULE, not a spreadsheet. The
 * presentation layer only ever sees these types, so the data could later come
 * from a database, a CMS or an internal API without touching the UI.
 */

/** A single song in a service. */
export interface Song {
  /** Hymnal number, or null for songs printed without one (Psalms, choruses). */
  number: string | null;
  title: string;
  /** Musical key as written in the sheet, e.g. "Ab", "C Dorian". */
  key: string | null;
}

/** Morning or evening. The sheet writes one of these beside every date. */
export type ServiceSlot = "AM" | "PM";

/** One service (one date and time) and the songs sung in it. */
export interface Service {
  /** Stable key for rendering. Derived from position in the sheet. */
  id: string;
  /** The date exactly as written in the sheet, e.g. "Sunday, September 6, 2026". */
  dateLabel: string;
  /** "Morning Service" / "Evening Service", or null when it cannot be told. */
  serviceLabel: string | null;
  slot: ServiceSlot | null;
  /** Calendar date in church time, "2026-09-06". null if the label has no readable date. */
  date: string | null;
  /** Start instant with the church's UTC offset, "2026-09-06T10:30:00-07:00". */
  startsAt: string | null;
  songs: Song[];
  /**
   * Song slots not filled in yet - rows holding only "TBD" or a formula error
   * such as "#N/A". Shown as "To be announced" on upcoming services; never
   * counted as songs.
   */
  pendingSongs: number;
}

/** One worksheet tab, normalized. */
export interface SongListMonth {
  /** The worksheet tab's real title, e.g. "September". Used as the UI label. */
  title: string;
  /** The in-sheet heading from row 1, e.g. "September Song List". */
  heading: string | null;
  /** A footnote written in the sheet, e.g. "Songs and Keys are subject to change". */
  note: string | null;
  services: Service[];
  /**
   * Populated only when the sheet's layout could not be understood, so the page
   * can still show the data as a plain table instead of showing nothing.
   */
  fallbackRows: string[][] | null;
}

/** A service that can be placed in time - the unit of song history. */
export interface DatedService {
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  songs: Song[];
}

export type SongListErrorReason =
  /** GOOGLE_SHEETS_API_KEY is not set in this environment. */
  | "not-configured"
  /** Google Sheets could not be reached, or returned something unusable. */
  | "unavailable";

export type SongListResult =
  | {
      ok: true;
      /** Visible tabs only, in tab order: what the schedule shows. */
      months: SongListMonth[];
      /** Every tab, hidden ones included: the raw material for song history. */
      allMonths: SongListMonth[];
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
