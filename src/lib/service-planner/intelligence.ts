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
import { capoMissing, NO_CAPO_RULES, type CapoRules } from "@/lib/capo-policy";
import { christmasSongs, inChristmasSeason } from "@/lib/church-calendar";
import { matchIndexSong, type IndexSong, type SheetMusicIndex } from "@/lib/sheet-music";
import { assignedFiles } from "@/lib/sheet-music-type";
import { usageCount } from "@/lib/song-history";
import { canonicalKey } from "@/lib/song-key";
import { normalizeKey, songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

import { isInsert, weekStartOf, type PlanSlots } from "./model";

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
  /**
   * The key it is sung in now (canonicalKey in src/lib/song-key.ts): the
   * Index's first key, else the planner catalog's usual key. Not a key it
   * happened to be sung in - those are in `plays`.
   */
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
  /** That is every expected musician with sheet music types (and there are several): say so, rather than name them. */
  missingForAll: boolean;
  /** Musicians who have other sheet music for it, but not the capo sheet music its key calls for. */
  capoFor: string[];
}

/** How many past plays travel with each candidate - enough for every fact the picker shows. */
export const RECENT_PLAYS = 40;

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
  /** The capo sheet music rules (src/lib/capo-policy.ts); none asked for when left out. */
  capo?: CapoRules;
}): CandidateSong[] {
  const { past, planned, catalog, index, hymnalCollection } = input;
  const capo = input.capo ?? NO_CAPO_RULES;
  const byId = new Map<string, CandidateSong>();
  /** The catalog's usual key, by song: the canonical key of a song the Index does not hold. */
  const catalogKeys = new Map<string, string | null>();
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
        missingForAll: false,
        capoFor: [],
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
    catalogKeys.set(entry.id, song.defaultKey);
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
    entry.defaultKey = canonicalKey({ indexKeys: indexSong?.keys, catalogKey: catalogKeys.get(entry.id) });
    if (indexSong) {
      const missing = missingSheetMusic(indexSong, input.musicians ?? [], {
        song: { title: entry.title, key: entry.defaultKey },
        rules: capo,
      });
      entry.missingFor = missing.none;
      entry.missingForAll = missing.everyone;
      entry.capoFor = missing.capo;
    }
    entry.collection ??= indexSong?.collection ?? null;
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The key to offer for a song: its own key (defaultKey, the canonical one).
 * Only a song with none - not in the Index, no usual key - falls back to the
 * key it was last sung in, which may be an old one.
 */
export function suggestKey(candidate: Pick<CandidateSong, "plays" | "defaultKey"> | null | undefined): string | null {
  return candidate?.defaultKey ?? candidate?.plays.find((play) => play.key)?.key ?? null;
}

/** The facts the picker shows for a song, looking from a service at `serviceStartsAt`. */
export interface CandidateFacts {
  /** The last time it was sung before that service. */
  lastSung: string | null;
  /** Whole days from then to the service. */
  daysSince: number | null;
  /**
   * How often it came round in the 12 months before the service: times sung,
   * or for an insert the weeks it was sung in (usageCount).
   */
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
    lastYear: usageCount(
      candidate,
      before.filter((play) => Date.parse(play.at) > start - 365 * DAY_MS).map((play) => ({ startsAt: play.at })),
    ),
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
  /**
   * Expected musicians who have none of their assigned sheet music types for
   * it. `everyone`: that is all of them, so they need not be named.
   */
  | { kind: "sheet-music-gap"; title: string; people: string[]; everyone: boolean }
  /** Musicians with other sheet music for it, but not the capo sheet music its key calls for. */
  | { kind: "capo-needed"; title: string; people: string[] }
  /**
   * None of the service's songs has sheet music for anyone - said once, in
   * place of a line for every song. `anyFiles`: some have files, though of no
   * type the expected musicians use.
   */
  | { kind: "no-sheet-music"; anyFiles: boolean }
  /** Planned in a key other than the song's own (canonical) key. */
  | { kind: "key-differs"; title: string; key: string; current: string }
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
export interface SheetMusicFinding {
  inIndex: boolean;
  /** It has files in Drive (of any type). */
  hasFiles: boolean;
  /** Expected musicians with none of their sheet music types for it, by name. */
  missing: string[];
  /** Those are every expected musician with sheet music types, and there are several. */
  everyone: boolean;
  /** Musicians with other sheet music for it, but not the capo sheet music it needs. */
  capo: string[];
  /** The song's own key (canonicalKey), to compare the planned key with. */
  key: string | null;
}

export type SheetMusicCheck = (song: { title: string; number: string | null }) => SheetMusicFinding;

/** Who is missing a song's sheet music, and how. */
export interface MissingSheetMusic {
  /** None of their assigned types has a PDF. */
  none: string[];
  /** `none` is every expected musician with types, and there are at least two. */
  everyone: boolean;
  /** Another of their types has one, but the song needs capo sheet music and has none. */
  capo: string[];
}

/**
 * The expected musicians a song's sheet music falls short for. Someone is
 * left with none when no type on their list has a PDF. Someone whose list
 * holds the capo type is also named when the song needs capo sheet music
 * (capoMissing in src/lib/capo-policy.ts) and has none - another type of
 * theirs is no substitute in that key. A song that needs none is not held to
 * it: their other types serve.
 */
export function missingSheetMusic(
  song: IndexSong,
  musicians: readonly PlannerMusician[],
  capo?: { song: { title: string; key: string | null }; rules: CapoRules },
): MissingSheetMusic {
  const relevant = musicians.filter((person) => person.typeIds.length > 0);
  const none = relevant.filter((person) => assignedFiles(song, person.typeIds, () => true).length === 0);
  const capoTypeId = capo && capoMissing(song, capo.song, capo.rules) ? capo.rules.policy.typeId : null;
  const withoutCapo =
    capoTypeId === null ? [] : relevant.filter((person) => person.typeIds.includes(capoTypeId) && !none.includes(person));
  return {
    none: none.map((person) => person.name),
    everyone: relevant.length > 1 && none.length === relevant.length,
    capo: withoutCapo.map((person) => person.name),
  };
}

/** The sheet music check, straight from the Index (the browser uses the candidates' copy instead). */
export function indexSheetMusicCheck(
  index: SheetMusicIndex,
  hymnalCollection: string,
  musicians: readonly PlannerMusician[],
  capo: CapoRules = NO_CAPO_RULES,
): SheetMusicCheck {
  return (song) => {
    const indexSong = matchIndexSong(index, song, hymnalCollection);
    if (!indexSong) return { inIndex: false, hasFiles: false, missing: [], everyone: false, capo: [], key: null };
    const key = canonicalKey({ indexKeys: indexSong.keys });
    const missing = missingSheetMusic(indexSong, musicians, { song: { title: song.title, key }, rules: capo });
    return {
      inIndex: true,
      hasFiles: sheetMusicStatus(indexSong) !== "none",
      missing: missing.none,
      everyone: missing.everyone,
      capo: missing.capo,
      key,
    };
  };
}

/** The sheet music check from the picker's candidates, which carry it to the browser. */
export function candidateSheetMusicCheck(candidates: ReadonlyMap<string, CandidateSong>): SheetMusicCheck {
  return (song) => {
    const candidate = candidates.get(songKey(song.title));
    return {
      inIndex: candidate?.inIndex ?? false,
      hasFiles: candidate?.sheetMusic === "complete" || candidate?.sheetMusic === "partial",
      missing: candidate?.missingFor ?? [],
      everyone: candidate?.missingForAll ?? false,
      capo: candidate?.capoFor ?? [],
      key: candidate?.defaultKey ?? null,
    };
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
  const findings: Array<{ song: (typeof songs)[number]; finding: SheetMusicFinding }> = [];

  for (const id of seen) {
    const song = songs.find((candidate) => songKey(candidate.title) === id)!;

    // The week's insert is meant to be sung in each of the week's services:
    // repeating it within its own week is the plan, not something to flag.
    const sameWeek = (startsAt: string) => isInsert(song) && weekStartOf(startsAt.slice(0, 10)) === weekStartOf(service.date);

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

    if (sheetMusic) findings.push({ song, finding: sheetMusic(song) });
  }

  // Sheet music, said as briefly as it can be: one line when no song has any
  // for anyone, "any of the expected musicians" when a song has none for all
  // of them, and the names only when just some are without.
  const lacking = ({ finding }: (typeof findings)[number]) =>
    !finding.inIndex || finding.everyone || (!finding.hasFiles && finding.missing.length > 0);
  if (findings.length > 1 && findings.every(lacking)) {
    signals.push({ kind: "no-sheet-music", anyFiles: findings.some(({ finding }) => finding.hasFiles) });
  } else {
    for (const { song, finding } of findings) {
      if (!finding.inIndex) signals.push({ kind: "no-sheet-music-entry", title: song.title });
      else if (finding.missing.length > 0) {
        signals.push({ kind: "sheet-music-gap", title: song.title, people: finding.missing, everyone: finding.everyone });
      }
    }
  }
  for (const { song, finding } of findings) {
    if (finding.capo.length > 0) signals.push({ kind: "capo-needed", title: song.title, people: finding.capo });
    if (song.key && finding.key && normalizeKey(song.key) !== normalizeKey(finding.key)) {
      signals.push({ kind: "key-differs", title: song.title, key: song.key, current: finding.key });
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
