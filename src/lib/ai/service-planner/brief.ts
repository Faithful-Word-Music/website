import { churchDate } from "@/lib/availability/occurrences";
import { inChristmasSeason, seasonDates } from "@/lib/church-calendar";
import { candidateFacts, type CandidateSong } from "@/lib/service-planner/intelligence";
import { isInsert, planSong, type PlanSlots, type PlanSong } from "@/lib/service-planner/model";
import { dayOfWeek } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";
import type { DatedService, ServiceSlot } from "@/types/song-list";

import { openPlaces } from "./locks";
import type { PlanAiRequest } from "./protocol";
import { christmasEligible, serviceSeason, type ServiceSeason } from "./season";

/**
 * The brief: everything one request to plan is decided from, put together
 * from what the browser sent (the editor's songs, the locks, the instruction)
 * and what the server read (the service, the catalog, the history, the week,
 * the library). Pure - unit tested.
 *
 * Two halves come out of it:
 *
 *   - what the MODEL is shown (prompt.ts): the service, its places, the week
 *     and a bounded list of candidate songs with the facts about each;
 *   - what the SERVER holds the answer to (validate.ts): which places are
 *     open, which song ids were offered, which may be put in.
 *
 * THE CANDIDATES ARE A SHORTLIST, NOT THE LIBRARY. The library is some 560
 * songs and most have never been sung here; sending all of them, with lyrics,
 * would be slow, costly and no better. buildShortlist() takes, in order:
 *
 *   1. the songs already in open places that may stay (so keeping one is
 *      always possible) - none, for the ordinary places of a fresh plan;
 *   2. songs found by meaning: near the insert and the locked songs, near
 *      what the instruction asks for, and near the season's subject;
 *   3. the songs sung most (the familiar backbone);
 *   4. familiar songs not sung for the longest;
 *   5. a few songs sung only once or twice.
 *
 * Those numbers bound a prompt. They are not planning policy: which of the
 * candidates to use is the philosophy's and the model's to decide.
 *
 * INSERTS ARE NOT CANDIDATES FOR AN ORDINARY PLACE. An insert is a song with
 * no hymnal number (isInsert), chosen for its week on the Inserts page. None
 * is ever offered for a place that does not hold one, so AI cannot give a
 * service an insert it did not have. Only when an insert's own place is open
 * - unlocked, and the Director's instruction given - are a few offered, for
 * that place, each marked. validate.ts holds the answer to the same rule.
 */

export const SHORTLIST = {
  /** The most candidates one request carries. */
  total: 110,
  thematic: 36,
  /** Of those found by meaning, how many may be songs never sung here. */
  neverSung: 6,
  mostSung: 40,
  rested: 24,
  lessFamiliar: 10,
  /** Sung at least this often counts, for picking candidates, as familiar. */
  familiarPlays: 3,
  /** Other inserts offered for an insert's place, when one is open. */
  inserts: 12,
} as const;

/** How much of a song's lyrics a candidate carries. */
export const OPENING_CHARS = 150;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sunday morning", or a special service's own name with it. */
export function serviceWords(service: { date: string; slot: ServiceSlot; label?: string | null }): string {
  const usual = `${DAY_NAMES[dayOfWeek(service.date)]} ${service.slot === "AM" ? "morning" : "evening"}`;
  return service.label ? `${service.label} (${usual})` : usual;
}

/** Another service of the same week, as the model is told of it. */
export interface WeekService {
  date: string;
  service: string;
  /** sung: it has happened. planned: published. draft: still being planned. */
  status: "sung" | "planned" | "draft";
  songs: Array<{ title: string; insert?: true }>;
}

/** What the server read for a request (run.ts). */
export interface PlanContext {
  service: { date: string; slot: ServiceSlot; startsAt: string; label: string | null; special: boolean };
  /** The stored service's revision; null when it is not stored yet. */
  revision: number | null;
  cancelled: boolean;
  /** Too long ago to change (isLocked in the planner's model). */
  frozen: boolean;
  /** Every song that can be planned, with its history (buildCandidates). */
  candidates: CandidateSong[];
  past: readonly DatedService[];
  week: WeekService[];
}

/** What the library added to it (run.ts). Empty when the lyric index is. */
export interface LibraryFindings {
  lyricsIndexed: boolean;
  /** Candidate ids found by meaning, nearest first. */
  thematic: string[];
  /** How each candidate's lyrics begin, by candidate id. */
  openings: ReadonlyMap<string, string>;
  /** Candidate ids whose lyrics name the Nativity. */
  nativity: ReadonlySet<string>;
}

export const NO_LIBRARY: LibraryFindings = { lyricsIndexed: false, thematic: [], openings: new Map(), nativity: new Set() };

/** One song the model may choose, with what the site knows of it. */
export interface PlanCandidate {
  id: string;
  title: string;
  number: string | null;
  /** Its book, when it is not in the church's hymnal. */
  collection?: string;
  timesSung: number;
  /** The last time before this service, "YYYY-MM-DD". */
  lastSung: string | null;
  daysBeforeThisService: number | null;
  timesInTheYearBefore: number;
  /** Other coming services it is already planned for. */
  alsoPlannedFor?: string[];
  /** The services of this same week it is in. */
  inThisWeek?: string[];
  lyricsBegin?: string;
  /** An insert (no hymnal number): only for a place marked insert. */
  insert?: true;
}

export interface BriefPlace {
  /** From 1, as people count them. */
  place: number;
  /** locked: not the model's to change. open: has a song the model may keep or change. empty: to be filled. */
  state: "locked" | "open" | "empty";
  song?: { id: string; title: string; number: string | null; insert?: true };
  /** An open place whose song may not stay (the Christmas season). */
  mustChange?: true;
}

export interface PlanBrief {
  mode: "generate" | "replace";
  /** generate: whether the songs in open places may stay on their merits (improve) or every open place starts again (fresh). */
  strategy: "improve" | "fresh";
  service: { date: string; name: string; special: boolean };
  season: ServiceSeason | null;
  seasonDates: ReturnType<typeof seasonDates>;
  places: BriefPlace[];
  week: WeekService[];
  instruction: string;
  candidates: PlanCandidate[];
  /** The first date in the records; null when there are none. */
  recordsBegin: string | null;
  lyricsIndexed: boolean;
  /** replace: the place asked about, from 1. */
  target?: number;

  // --- what the server holds the answer to; none of it goes to the model ---
  slots: PlanSlots;
  /** The places the answer must cover, from 0. */
  open: number[];
  /** Every id the model was offered. */
  offered: ReadonlySet<string>;
  /** The site's record of each offered song. */
  songs: ReadonlyMap<string, CandidateSong>;
  startsAt: string;
  /** In the Christmas season: the ids that may be put in. Null at any other time. */
  christmasOnly: ReadonlySet<string> | null;
  /**
   * The open places that held an insert when the request was made, from 0:
   * the only places an insert may be put. Empty when every insert is locked
   * or held, which is the usual case.
   */
  insertPlaces: number[];
}

/** A song the editor holds that the catalog does not know: it can be kept, and nothing is known of it. */
function unknownSong(song: PlanSong): CandidateSong {
  return {
    id: songKey(song.title),
    title: song.title,
    number: song.number,
    collection: null,
    plays: [],
    playCount: 0,
    upcoming: [],
    defaultKey: null,
    sheetMusic: "unknown",
    christmas: false,
    isNew: false,
    inIndex: false,
    missingFor: [],
    missingForAll: false,
    capoFor: [],
  };
}

/** The candidates for one request, most relevant first, at most SHORTLIST.total. */
export function buildShortlist(input: {
  candidates: readonly CandidateSong[];
  startsAt: string;
  /** Songs in places the model cannot change: never offered, as they cannot be used twice. */
  fixed: ReadonlySet<string>;
  /** Songs in open places that may stay: always offered. */
  keepable: readonly CandidateSong[];
  thematic: readonly string[];
  christmasOnly: ReadonlySet<string> | null;
  /** An insert's own place is open: a few other inserts are offered, for that place. */
  insertOpen: boolean;
}): CandidateSong[] {
  const { candidates, startsAt, fixed, christmasOnly } = input;
  const allowed = (song: CandidateSong) =>
    !fixed.has(song.id) && (christmasOnly ? christmasOnly.has(song.id) : !song.christmas);
  const everything = candidates.filter(allowed);
  // Ordinary places are planned from songs of the hymnal only: an insert is never one of their candidates.
  const pool = everything.filter((song) => !isInsert(song));
  const byId = new Map(pool.map((song) => [song.id, song]));
  const lastSung = (song: CandidateSong) => candidateFacts(song, startsAt).lastSung ?? "";

  const picked = new Map<string, CandidateSong>();
  const take = (songs: Iterable<CandidateSong>, limit: number) => {
    let taken = 0;
    for (const song of songs) {
      if (taken >= limit || picked.size >= SHORTLIST.total) return;
      if (picked.has(song.id)) continue;
      picked.set(song.id, song);
      taken += 1;
    }
  };

  take(input.keepable, input.keepable.length);

  if (input.insertOpen) {
    // For the insert's own place: those nearest what was asked for, then the most sung.
    const inserts = everything.filter(isInsert);
    const near = new Map(input.thematic.map((id, order) => [id, order]));
    take(
      inserts.sort(
        (a, b) =>
          (near.get(a.id) ?? Infinity) - (near.get(b.id) ?? Infinity) || b.playCount - a.playCount || a.id.localeCompare(b.id),
      ),
      SHORTLIST.inserts,
    );
  }

  if (christmasOnly) {
    // The Christmas repertoire is small: all of it, most sung first.
    take([...pool].sort((a, b) => b.playCount - a.playCount || a.id.localeCompare(b.id)), SHORTLIST.total);
    return [...picked.values()];
  }

  let unsung = 0;
  const near = input.thematic.flatMap((id) => {
    const song = byId.get(id);
    if (!song) return [];
    if (song.playCount === 0 && (unsung += 1) > SHORTLIST.neverSung) return [];
    return [song];
  });
  take(near, SHORTLIST.thematic);

  const familiar = pool.filter((song) => song.playCount >= SHORTLIST.familiarPlays);
  take([...familiar].sort((a, b) => b.playCount - a.playCount || a.id.localeCompare(b.id)), SHORTLIST.mostSung);
  take([...familiar].sort((a, b) => lastSung(a).localeCompare(lastSung(b)) || a.id.localeCompare(b.id)), SHORTLIST.rested);
  take(
    pool
      .filter((song) => song.playCount > 0 && song.playCount < SHORTLIST.familiarPlays)
      .sort((a, b) => lastSung(a).localeCompare(lastSung(b)) || a.id.localeCompare(b.id)),
    SHORTLIST.lessFamiliar,
  );
  return [...picked.values()];
}

/** A candidate as the model is shown it: the song and the facts, looking from the service being planned. */
export function describeCandidate(
  song: CandidateSong,
  input: { startsAt: string; hymnal: string; week: readonly WeekService[]; openings: ReadonlyMap<string, string> },
): PlanCandidate {
  const facts = candidateFacts(song, input.startsAt);
  const inWeek = input.week.filter((service) => service.songs.some((item) => songKey(item.title) === song.id)).map((service) => service.service);
  const planned = [...new Set(facts.upcoming.map((at) => churchDate(Date.parse(at))))].slice(0, 3);
  const opening = input.openings.get(song.id);
  return {
    id: song.id,
    title: song.title,
    number: song.number,
    ...(song.collection && song.collection !== input.hymnal ? { collection: song.collection } : {}),
    timesSung: song.playCount,
    lastSung: facts.lastSung ? churchDate(Date.parse(facts.lastSung)) : null,
    daysBeforeThisService: facts.daysSince,
    timesInTheYearBefore: facts.lastYear,
    ...(planned.length > 0 ? { alsoPlannedFor: planned } : {}),
    ...(inWeek.length > 0 ? { inThisWeek: inWeek } : {}),
    ...(opening ? { lyricsBegin: opening } : {}),
    ...(isInsert(song) ? { insert: true as const } : {}),
  };
}

/** The brief for one request. */
export function buildBrief(
  request: Pick<PlanAiRequest, "mode" | "slots" | "locked" | "instruction" | "target"> & Partial<Pick<PlanAiRequest, "strategy">>,
  context: PlanContext,
  library: LibraryFindings,
  hymnal: string,
): PlanBrief {
  const slots: PlanSlots = request.slots.map((song) => (song ? planSong(song) : null));
  const { date, startsAt } = context.service;
  const instruction = request.instruction.trim();
  const strategy = request.mode === "generate" ? (request.strategy ?? "improve") : "improve";
  const known = new Map(context.candidates.map((song) => [song.id, song]));
  const idOf = (song: PlanSong) => songKey(song.title);

  const christmasOnly = inChristmasSeason(date)
    ? christmasEligible({ candidates: context.candidates, past: context.past, nativity: library.nativity })
    : null;

  // Suggesting for one place changes nothing else: that place alone is open.
  const open =
    request.mode === "replace"
      ? [request.target ?? 0]
      : // With nothing asked, every unlocked insert stays where it is.
        openPlaces(slots, request.locked, instruction === "");
  const isOpen = new Set(open);
  // Where an insert may go: a place the answer covers that holds one now.
  const insertPlaces = open.filter((index) => slots[index] !== null && isInsert(slots[index]!));

  const fixed = new Set<string>();
  const keepable: CandidateSong[] = [];
  const places: BriefPlace[] = slots.map((song, index) => {
    const place = index + 1;
    if (!song) return { place, state: "empty" };
    const named = { id: idOf(song), title: song.title, number: song.number, ...(isInsert(song) ? { insert: true as const } : {}) };
    // Asked for something else in this place: the song there is not among the suggestions.
    if (request.mode === "replace") {
      fixed.add(named.id);
      // Said as it is in the editor, so a reason never calls an unlocked song locked.
      return { place, state: request.locked[index] && index !== request.target ? "locked" : "open", song: named };
    }
    if (!isOpen.has(index)) {
      fixed.add(named.id);
      return { place, state: "locked", song: named };
    }
    // A fresh plan starts every ordinary open place again: the song there is not shown and is not owed a
    // place among the candidates. (It is not banned either - the shortlist may hold it on its own merits.)
    // An insert is the week's, not this plan's, so it is shown and can be kept whichever way the plan is made.
    if (strategy === "fresh" && !isInsert(song)) return { place, state: "empty" };
    // In the Christmas season only an insert may stay without being known for a Christmas song.
    const mayStay = !christmasOnly || christmasOnly.has(named.id) || isInsert(song);
    if (mayStay) keepable.push(known.get(named.id) ?? unknownSong(song));
    return { place, state: "open", song: named, ...(mayStay ? {} : { mustChange: true as const }) };
  });

  const shortlist = buildShortlist({
    candidates: context.candidates,
    startsAt,
    fixed,
    keepable,
    thematic: library.thematic,
    // An insert kept in its own place is the one exception, and it is in `keepable`.
    christmasOnly,
    insertOpen: insertPlaces.length > 0,
  });
  const songs = new Map(shortlist.map((song) => [song.id, song]));

  return {
    mode: request.mode,
    strategy,
    service: { date, name: serviceWords(context.service), special: context.service.special },
    season: serviceSeason(date),
    seasonDates: seasonDates(Number(date.slice(0, 4))),
    places,
    week: context.week,
    instruction,
    candidates: shortlist
      .map((song) => describeCandidate(song, { startsAt, hymnal, week: context.week, openings: library.openings }))
      // By title, so the order says nothing about which to choose.
      .sort((a, b) => a.id.localeCompare(b.id)),
    recordsBegin: [...context.past].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null,
    lyricsIndexed: library.lyricsIndexed,
    ...(request.mode === "replace" ? { target: (request.target ?? 0) + 1 } : {}),
    slots,
    open,
    offered: new Set(songs.keys()),
    songs,
    startsAt,
    christmasOnly,
    insertPlaces,
  };
}

/** How many of the open places need a song that is not already in one of them. */
export function placesToFill(brief: PlanBrief): number {
  return brief.open.filter((index) => {
    const place = brief.places[index];
    return place.state === "empty" || place.mustChange === true;
  }).length;
}

/**
 * How many offered songs could fill an ordinary place that needs one: not an
 * insert, and not a song the model is shown as already in the service. (In a
 * fresh plan the songs of the places being planned again are not shown, so
 * one of them offered on its merits counts.)
 */
export function newSongsOffered(brief: PlanBrief): number {
  const inService = new Set(brief.places.flatMap((place) => (place.song ? [place.song.id] : [])));
  return [...brief.offered].filter((id) => !inService.has(id) && !isInsert(brief.songs.get(id)!)).length;
}
