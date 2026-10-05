import { songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

/**
 * The church's seasons. Pure functions; dates are "YYYY-MM-DD" on the
 * church's calendar, as services carry them.
 *
 * ---------------------------------------------------------------------------
 * THE CHRISTMAS SEASON
 * ---------------------------------------------------------------------------
 * Christmas songs are sung from the first service AFTER Thanksgiving - never
 * before - up to Christmas Day, or the last service before it when Christmas
 * is not a church day. So the season is every date from the day after
 * Thanksgiving (the fourth Thursday of November) to December 25.
 *
 * Which songs are Christmas songs is read from the records rather than kept
 * in a list: a Christmas song is one that has only ever been sung in the
 * season. A new carol is recognised the first December it is sung. A regular
 * hymn that so far happens to have been sung only at Christmastime counts as
 * one too - until the first time it is sung at any other time of year, when
 * it stops counting, so the records correct themselves as they grow.
 *
 * Easter and Thanksgiving are here as dates only: what is sung around them is
 * the Music Director's planning philosophy (src/lib/ai/planning), not a rule
 * this file enforces.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** Thanksgiving Day: the fourth Thursday of November. */
export function thanksgiving(year: number): string {
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return `${year}-11-${pad(firstThursday + 21)}`;
}

/** The first and last date Christmas songs may be sung in `year`. */
export function christmasSeason(year: number): { from: string; to: string } {
  const day = Number(thanksgiving(year).slice(8)) + 1;
  return { from: `${year}-11-${pad(day)}`, to: `${year}-12-25` };
}

/** Whether Christmas songs may be sung on `date`. */
export function inChristmasSeason(date: string): boolean {
  const { from, to } = christmasSeason(Number(date.slice(0, 4)));
  return date >= from && date <= to;
}

/** Easter Sunday (the Gregorian reckoning, as the church keeps it). */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The dates one year's seasons turn on, so nothing that reads them has to work them out. */
export function seasonDates(year: number): { year: number; easter: string; thanksgiving: string; christmasSeason: { from: string; to: string } } {
  return { year, easter: easter(year), thanksgiving: thanksgiving(year), christmasSeason: christmasSeason(year) };
}

/** The ids (songKey) of every song only ever sung in the Christmas season. */
export function christmasSongs(services: DatedService[]): Set<string> {
  const inSeason = new Set<string>();
  const outOfSeason = new Set<string>();
  for (const service of services) {
    const season = inChristmasSeason(service.date);
    for (const song of service.songs) {
      const id = songKey(song.title);
      if (id !== "") (season ? inSeason : outOfSeason).add(id);
    }
  }
  return new Set([...inSeason].filter((id) => !outOfSeason.has(id)));
}
