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

/** One service (one date) and the songs sung in it. */
export interface Service {
  /** Stable key for rendering. Derived from position in the sheet. */
  id: string;
  /** The date exactly as written in the sheet, e.g. "Sunday, September 6, 2026". */
  dateLabel: string;
  /**
   * Disambiguates multiple services on the same date ("Morning Service").
   * null when the date occurs only once that month.
   */
  serviceLabel: string | null;
  songs: Song[];
}

/** One worksheet tab, normalized. */
export interface SongListMonth {
  /** The worksheet tab's real title, e.g. "September". Used as the UI label. */
  title: string;
  /** The in-sheet heading from row 1, e.g. "September Song List". */
  heading: string | null;
  services: Service[];
  /**
   * Populated only when the sheet's layout could not be understood, so the page
   * can still show the data as a plain table instead of showing nothing.
   */
  fallbackRows: string[][] | null;
}

export type SongListErrorReason =
  /** GOOGLE_SHEETS_API_KEY is not set in this environment. */
  | "not-configured"
  /** Google Sheets could not be reached, or returned something unusable. */
  | "unavailable";

export type SongListResult =
  | { ok: true; months: SongListMonth[] }
  | { ok: false; reason: SongListErrorReason };
