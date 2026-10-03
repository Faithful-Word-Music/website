/**
 * Planning intelligence: what the planner knows about a song while choosing
 * it, and what it notices about a whole service. Pure - unit tested.
 *
 * Everything here is structured data (kinds, dates, names), not sentences.
 * The workspace words it for people (src/content/service-planner.ts); a
 * future song-list assistant could read exactly the same signals.
 *
 * Signals inform, never block: nothing here stops a service being saved or
 * published.
 */

import { siteConfig } from "@/config/site";
import type { RosterPerson } from "@/lib/availability/board";
import { effectiveAvailability, type ExceptionStatus } from "@/lib/availability/effective";
import type { Occurrence } from "@/lib/availability/occurrences";
import { christmasSongs, inChristmasSeason } from "@/lib/church-calendar";
import { matchIndexSong, type IndexSong, type SheetMusicIndex } from "@/lib/sheet-music";
import { assignedFiles } from "@/lib/sheet-music-type";
import { songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

import { weekStartOf, type PlanSlots } from "./model";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The song picker's catalog
// ---------------------------------------------------------------------------

export type SheetMusicStatus = "complete" | "partial" | "none" | "unknown";

/** One song the picker can offer, with what the planner should know about it. */
export interface CandidateSong {
  /** songKey(): one song, however its title is punctuated. */
  id: string;
  title: string;
  number: string | null;
  collection: string | null;
  /** Each time it was sung, newest first (at most RECENT_PLAYS): start and key. */
  plays: Array<{ at: string; key: string | null }>;
  /** Total times sung, ever. */
  playCount: number;
  /** Start times of other services it is already planned for (drafts included), soonest first. */
  upcoming: string[];
  /** The planner catalog's default key, or the Index's first key. */
  defaultKey: string | null;
  sheetMusic: SheetMusicStatus;
  /** Only ever sung in the Christmas season (src/lib/church-calendar.ts). */
  christmas: boolean;
  /** Added in the planner, never yet sung. */
  isNew: boolean;
  /** In the Sheet Music Index (false also when the Index could not be read). */
  inIndex: boolean;
  /** Musicians expected at the service being planned who have none of their sheet music types for it. */
  missingFor: string[];
}

/** How many past plays travel with each candidate - enough for every fact the picker shows. */
export const RECENT_PLAYS = 40;

/** "G, Ab" (the Index's Key(s) column) -> "G". */
export function firstKey(keys: string | null | undefined): string | null {
  const first = keys?.split(/[,/;]/)[0]?.trim();
  return first ? first : null;
}

/** Whether a song in the Index has sheet music: every version with a PDF, some, or none. */
export function sheetMusicStatus(song: IndexSong | null): SheetMusicStatus {
  if (!song) return "unknown";
  const files = song.versions.flatMap((version) => version.files);
  if (files.length === 0) return "none";
  const complete = song.versions.every((version) => version.files.some((file) => file.format === "pdf"));
  return complete ? "complete" : "partial";
}

/**
 * Every song the planner can choose: everything ever sung, everything in the
 * planner's catalog and everything in the Sheet Music Index, once each.
 */
export function buildCandidates(input: {
  past: readonly DatedService[];
  /** Musicians expected at the service being planned, for missingFor. */
  musicians?: readonly PlannerMusician[];
  /** Services still to come (drafts too), for "also planned for". */
  planned: ReadonlyArray<{ startsAt: string; songs: ReadonlyArray<{ title: string }> }>;
  catalog: ReadonlyArray<{ title: string; number: string | null; collection: string | null; defaultKey: string | null }>;
  index: SheetMusicIndex | null;
  hymnalCollection: string;
}): CandidateSong[] {
  const { past, planned, catalog, index, hymnalCollection } = input;
  const byId = new Map<string, CandidateSong>();
  const seasonal = christmasSongs([...past]);

  const ensure = (title: string, number: string | null, collection: string | null): CandidateSong | null => {
    const id = songKey(title);
    if (id === "") return null;
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        id,
        title,
        number,
        collection,
        plays: [],
        playCount: 0,
        upcoming: [],
        defaultKey: null,
        sheetMusic: "unknown",
        christmas: seasonal.has(id),
        isNew: false,
        inIndex: false,
        missingFor: [],
      };
      byId.set(id, entry);
    }
    entry.number ??= number;
    entry.collection ??= collection;
    return entry;
  };

  // Newest first, so the latest spelling and number win.
  const ordered = [...past].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  for (const service of ordered) {
    for (const song of service.songs) {
      const entry = ensure(song.title, song.number, null);
      if (!entry) continue;
      entry.playCount += 1;
      if (entry.plays.length < RECENT_PLAYS) entry.plays.push({ at: service.startsAt, key: song.key });
    }
  }

  for (const song of catalog) {
    const known = byId.has(songKey(song.title));
    const entry = ensure(song.title, song.number, song.collection);
    if (!entry) continue;
    entry.defaultKey = song.defaultKey ?? entry.defaultKey;
    if (!known) entry.isNew = true;
  }

  for (const song of index?.songs ?? []) {
    const number = song.collection === hymnalCollection ? song.hymnNumber : null;
    ensure(song.title, number, song.collection);
  }

  for (const service of planned) {
    for (const song of service.songs) {
      byId.get(songKey(song.title))?.upcoming.push(service.startsAt);
    }
  }

  for (const entry of byId.values()) {
    entry.upcoming.sort((a, b) => Date.parse(a) - Date.parse(b));
    const indexSong = index ? matchIndexSong(index, entry, hymnalCollection) : null;
    if (index) entry.sheetMusic = sheetMusicStatus(indexSong);
    entry.inIndex = indexSong !== null;
    if (indexSong) entry.missingFor = missingSheetMusic(indexSong, input.musicians ?? []);
    entry.defaultKey ??= firstKey(indexSong?.keys);
    entry.collection ??= indexSong?.collection ?? null;
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The key to offer for a song: the key it was last sung in, else its default. */
export function suggestKey(candidate: Pick<CandidateSong, "plays" | "defaultKey"> | null | undefined): string | null {
  return candidate?.plays.find((play) => play.key)?.key ?? candidate?.defaultKey ?? null;
}

/** The facts the picker shows for a song, looking from a service at `serviceStartsAt`. */
export interface CandidateFacts {
  /** The last time it was sung before that service. */
  lastSung: string | null;
  /** Whole days from then to the service. */
  daysSince: number | null;
  /** Times sung in the 12 months before the service. */
  lastYear: number;
  /** Times sung so far in the service's calendar year. */
  thisYear: number;
  /** Distinct keys, most recent first. */
  recentKeys: string[];
  /** Other planned services, excluding this one. */
  upcoming: string[];
  suggestedKey: string | null;
}

export function candidateFacts(candidate: CandidateSong, serviceStartsAt: string): CandidateFacts {
  const start = Date.parse(serviceStartsAt);
  const year = serviceStartsAt.slice(0, 4);
  const before = candidate.plays.filter((play) => Date.parse(play.at) < start);
  const last = before[0] ?? null;
  const keys: string[] = [];
  for (const play of before) {
    if (play.key && !keys.includes(play.key)) keys.push(play.key);
  }
  return {
    lastSung: last?.at ?? null,
    daysSince: last ? Math.floor((start - Date.parse(last.at)) / DAY_MS) : null,
    lastYear: before.filter((play) => Date.parse(play.at) > start - 365 * DAY_MS).length,
    thisYear: before.filter((play) => play.at.slice(0, 4) === year).length,
    recentKeys: keys.slice(0, 3),
    upcoming: candidate.upcoming.filter((at) => at !== serviceStartsAt),
    suggestedKey: suggestKey({ plays: before, defaultKey: candidate.defaultKey }),
  };
}

// ---------------------------------------------------------------------------
// A whole service
// ---------------------------------------------------------------------------

export type PlanningSignal =
  /** The same song twice in this service. */
  | { kind: "duplicate"; title: string }
  /** Sung within recentDays before this service. */
  | { kind: "recently-sung"; title: string; at: string; days: number }
  /** Also planned for another service within recentDays either side. */
  | { kind: "planned-nearby"; title: string; at: string }
  /** Two of this service's songs were last sung together not long ago. */
  | { kind: "repeated-pair"; titles: [string, string]; at: string }
  /** A Christmas song outside the Christmas season. */
  | { kind: "out-of-season"; title: string }
  /** Not in the Sheet Music Index at all. */
  | { kind: "no-sheet-music-entry"; title: string }
  /** Expected musicians who have none of their assigned sheet music types for it. */
  | { kind: "sheet-music-gap"; title: string; people: string[] }
  /** Places not filled yet. */
  | { kind: "empty-places"; count: number };

/** How far back two songs sung together counts as a repeated pairing. */
export const PAIR_WINDOW_DAYS = 90;

/** A musician as the sheet-music check needs them. */
export interface PlannerMusician {
  id: string;
  name: string;
  /** Their sheet music types in order of preference (admin-assigned). */
  typeIds: number[];
}

/** What the sheet music check says about one song. */
export type SheetMusicCheck = (song: { title: string; number: string | null }) => { inIndex: boolean; missing: string[] };

/** The expected musicians who have none of their assigned sheet music types for a song. */
export function missingSheetMusic(song: IndexSong, musicians: readonly PlannerMusician[]): string[] {
  return musicians
    .filter((person) => person.typeIds.length > 0)
    .filter((person) => assignedFiles(song, person.typeIds, () => true).length === 0)
    .map((person) => person.name);
}

/** The sheet music check, straight from the Index (the browser uses the candidates' copy instead). */
export function indexSheetMusicCheck(
  index: SheetMusicIndex,
  hymnalCollection: string,
  musicians: readonly PlannerMusician[],
): SheetMusicCheck {
  return (song) => {
    const indexSong = matchIndexSong(index, song, hymnalCollection);
    return indexSong ? { inIndex: true, missing: missingSheetMusic(indexSong, musicians) } : { inIndex: false, missing: [] };
  };
}

/** The sheet music check from the picker's candidates, for the browser. */
export function candidateSheetMusicCheck(candidates: ReadonlyMap<string, CandidateSong>): SheetMusicCheck {
  return (song) => {
    const candidate = candidates.get(songKey(song.title));
    return { inIndex: candidate?.inIndex ?? false, missing: candidate?.missingFor ?? [] };
  };
}

export function serviceSignals(input: {
  service: { startsAt: string; date: string; slots: PlanSlots };
  past: readonly DatedService[];
  /** Other services still to come (drafts included), with their songs. */
  planned: ReadonlyArray<{ startsAt: string; songs: ReadonlyArray<{ title: string }> }>;
  /** The sheet music check for a song; null when the Sheet Music Index cannot be read. */
  sheetMusic: SheetMusicCheck | null;
  recentDays?: number;
}): PlanningSignal[] {
  const { service, past, planned, sheetMusic } = input;
  const recentDays = input.recentDays ?? siteConfig.servicePlanner.recentDays;
  const start = Date.parse(service.startsAt);
  const songs = service.slots.filter((song) => song !== null);
  const signals: PlanningSignal[] = [];

  const seen = new Set<string>();
  for (const song of songs) {
    const id = songKey(song.title);
    if (seen.has(id)) signals.push({ kind: "duplicate", title: song.title });
    seen.add(id);
  }

  const earlier = [...past]
    .filter((other) => Date.parse(other.startsAt) < start)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const seasonal = christmasSongs([...past]);
  const inSeason = inChristmasSeason(service.date);

  for (const id of seen) {
    const song = songs.find((candidate) => songKey(candidate.title) === id)!;

    // The week's insert is meant to be sung in each of the week's services:
    // repeating it within its own week is the plan, not something to flag.
    const sameWeek = (startsAt: string) => song.insert && weekStartOf(startsAt.slice(0, 10)) === weekStartOf(service.date);

    const last = earlier.find((other) => other.songs.some((sung) => songKey(sung.title) === id));
    if (last && !sameWeek(last.startsAt)) {
      const days = Math.floor((start - Date.parse(last.startsAt)) / DAY_MS);
      if (days <= recentDays) signals.push({ kind: "recently-sung", title: song.title, at: last.startsAt, days });
    }

    const nearby = planned
      .filter((other) => other.startsAt !== service.startsAt)
      .filter((other) => Math.abs(Date.parse(other.startsAt) - start) <= recentDays * DAY_MS)
      .filter((other) => !sameWeek(other.startsAt))
      .find((other) => other.songs.some((planned) => songKey(planned.title) === id));
    if (nearby) signals.push({ kind: "planned-nearby", title: song.title, at: nearby.startsAt });

    if (!inSeason && seasonal.has(id)) signals.push({ kind: "out-of-season", title: song.title });

    if (sheetMusic) {
      const check = sheetMusic(song);
      if (!check.inIndex) signals.push({ kind: "no-sheet-music-entry", title: song.title });
      else if (check.missing.length > 0) signals.push({ kind: "sheet-music-gap", title: song.title, people: check.missing });
    }
  }

  const ids = [...seen];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      const together = earlier.find(
        (other) =>
          Date.parse(other.startsAt) > start - PAIR_WINDOW_DAYS * DAY_MS &&
          other.songs.some((sung) => songKey(sung.title) === ids[a]) &&
          other.songs.some((sung) => songKey(sung.title) === ids[b]),
      );
      if (together) {
        const titleOf = (id: string) => songs.find((song) => songKey(song.title) === id)!.title;
        signals.push({ kind: "repeated-pair", titles: [titleOf(ids[a]), titleOf(ids[b])], at: together.startsAt });
      }
    }
  }

  const empty = service.slots.filter((song) => song === null).length;
  if (empty > 0) signals.push({ kind: "empty-places", count: empty });

  return signals;
}

// ---------------------------------------------------------------------------
// Who will be there
// ---------------------------------------------------------------------------

export interface ServiceAvailability {
  /** Effectively available, by name. */
  expected: Array<{ id: string; name: string }>;
  /** Normally there, but not this time - with their note. */
  away: Array<{ id: string; name: string; note: string | null }>;
  /** Not normally there, but coming this time. */
  extra: Array<{ id: string; name: string; note: string | null }>;
}

/** The music team for one service, from effectiveAvailability() - the same rules as the board. */
export function serviceAvailability(
  occurrence: Pick<Occurrence, "normalKey">,
  roster: readonly RosterPerson[],
  exceptions: ReadonlyArray<{ userId: string; status: ExceptionStatus; note: string | null }>,
): ServiceAvailability {
  const byUser = new Map(exceptions.map((row) => [row.userId, row]));
  const result: ServiceAvailability = { expected: [], away: [], extra: [] };
  for (const person of [...roster].sort((a, b) => a.name.localeCompare(b.name))) {
    const row = byUser.get(person.id);
    const status = effectiveAvailability(person.normal, occurrence, row?.status);
    if (status.effective) result.expected.push({ id: person.id, name: person.name });
    if (status.state === "unavailable-by-exception") result.away.push({ id: person.id, name: person.name, note: row?.note ?? null });
    if (status.state === "available-by-exception") result.extra.push({ id: person.id, name: person.name, note: row?.note ?? null });
  }
  return result;
}
