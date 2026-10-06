import { candidateFacts } from "@/lib/service-planner/intelligence";
import { isInsert, planSong, type PlanSlots, type PlanSong } from "@/lib/service-planner/model";
import { songKey } from "@/lib/song-list";

import type { PlanBrief } from "./brief";
import { SUGGESTIONS, type GeneratedPlan, type SuggestedSongs } from "./prompt";
import type { SongSuggestion } from "./protocol";

/**
 * The model's answer, held to the rules and turned into the site's own
 * records. Pure - unit tested.
 *
 * The model only ever says WHICH song goes WHERE, by id. Everything else in
 * the plan that goes back to the editor is the site's: the title and number
 * from the catalog, the key from the planner's own logic. Whether a song is
 * an insert is not said by anyone - it is the song having no hymnal number
 * (planSong). So nothing the model writes reaches a service plan as text, and
 * an id that was not offered has nothing to become.
 *
 * An answer is refused whole when it:
 *
 *   - answers for a place it was not asked about (a locked one), or leaves
 *     out one it was;
 *   - names a song that was not among the candidates;
 *   - puts a song in the service twice, counting the songs it could not move;
 *   - gives the service an insert it did not have: an insert anywhere but in
 *     a place that held one, or more inserts than there were such places.
 *     (An insert already there may be moved.) With every insert locked or
 *     held, that is any insert at all;
 *   - in the Christmas season, puts in a song not established as a Christmas
 *     song (an insert kept in its own place is the one exception).
 *
 * Each problem is said in words the model can act on, for the one second try
 * (plan.ts).
 */

export type AppliedPlan =
  | { ok: true; slots: PlanSlots; /** Places whose song is now a different one, from 0. */ changed: number[] }
  | { ok: false; problems: string[] };

/** The key a song newly put into this service takes: the planner's own suggestion, never the model's. */
function newSong(brief: PlanBrief, id: string): PlanSong {
  const song = brief.songs.get(id)!;
  return planSong({ title: song.title, number: song.number, key: candidateFacts(song, brief.startsAt).suggestedKey });
}

export function applyPlan(brief: PlanBrief, answer: GeneratedPlan): AppliedPlan {
  const problems: string[] = [];
  const open = new Set(brief.open);
  const chosen = new Map<number, string>();

  for (const entry of answer.places) {
    const index = entry.place - 1;
    if (!Number.isInteger(entry.place) || !open.has(index)) {
      problems.push(`Place ${entry.place} is not one of the places to answer for.`);
    } else if (chosen.has(index)) {
      problems.push(`Place ${entry.place} was answered more than once.`);
    } else if (!brief.offered.has(entry.songId)) {
      problems.push(`"${entry.songId}" is not the id of a candidate.`);
    } else {
      chosen.set(index, entry.songId);
    }
  }
  for (const index of brief.open) {
    if (!chosen.has(index) && !problems.some((problem) => problem.startsWith(`Place ${index + 1} `))) {
      problems.push(`Place ${index + 1} was not answered.`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  // The songs the answer could not touch, then the ones it chose: no song twice.
  const used = new Set(brief.slots.flatMap((song, index) => (song && !open.has(index) ? [songKey(song.title)] : [])));
  for (const [index, id] of chosen) {
    if (used.has(id)) problems.push(`"${id}" (place ${index + 1}) would be in the service twice.`);
    used.add(id);
  }

  // Where each song of an open place stood, so one kept or moved stays exactly as it was.
  const standing = new Map<string, { song: PlanSong; index: number }>();
  for (const index of brief.open) {
    const song = brief.slots[index];
    if (song && !standing.has(songKey(song.title))) standing.set(songKey(song.title), { song, index });
  }
  // No insert the service did not have. One may go only where an insert stood - or be an insert that was
  // already here, moved - and there may be no more of them than there were places for.
  const insertPlaces = new Set(brief.insertPlaces);
  let inserts = 0;
  for (const [index, id] of chosen) {
    if (!isInsert(brief.songs.get(id)!)) continue;
    inserts += 1;
    if (!insertPlaces.has(index) && !standing.has(id)) {
      problems.push(`"${id}" (place ${index + 1}) is an insert, and place ${index + 1} is not an insert's place.`);
    }
  }
  if (inserts > insertPlaces.size) {
    problems.push(
      insertPlaces.size === 0
        ? "This service's inserts are not yours to change, and no other insert may be added."
        : `The service may have at most ${insertPlaces.size} insert${insertPlaces.size === 1 ? "" : "s"} among the places you answer for.`,
    );
  }

  /** An insert the answer left in its own place. */
  const keptInPlace = (index: number, id: string) =>
    insertPlaces.has(index) && songKey(brief.slots[index]!.title) === id;

  if (brief.christmasOnly) {
    for (const [index, id] of chosen) {
      const exempt = keptInPlace(index, id);
      if (!exempt && !brief.christmasOnly.has(id)) {
        problems.push(`"${id}" (place ${index + 1}) is not established as a Christmas song, and this service is in the Christmas season.`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const slots: PlanSlots = [...brief.slots];
  const changed: number[] = [];
  for (const [index, id] of chosen) {
    const before = brief.slots[index];
    const kept = standing.get(id);
    // A song put where an insert stood is an insert if it has no hymnal number, and an ordinary song if
    // it has one: nothing here decides which.
    slots[index] = kept ? kept.song : newSong(brief, id);
    if (!before || songKey(before.title) !== id) changed.push(index);
  }
  return { ok: true, slots, changed: changed.sort((a, b) => a - b) };
}

export type AppliedSuggestions = { ok: true; suggestions: SongSuggestion[] } | { ok: false; problems: string[] };

/** Longest reason shown beside a suggestion. */
const REASON_CHARS = 240;

/**
 * The suggestions for one place that can be offered: each a candidate, not in
 * the service already, not given twice, an insert only when the place asked
 * about holds one and, in the Christmas season, a Christmas song. One that
 * fails is dropped; an answer with none left is refused.
 */
export function applySuggestions(brief: PlanBrief, answer: SuggestedSongs): AppliedSuggestions {
  const inService = new Set(brief.slots.flatMap((song) => (song ? [songKey(song.title)] : [])));
  const problems: string[] = [];
  const seen = new Set<string>();
  const suggestions: SongSuggestion[] = [];
  /** The place asked about holds an insert: only then may one be suggested for it. */
  const forInsert = brief.insertPlaces.length > 0;

  for (const { songId, reason } of answer.suggestions) {
    if (inService.has(songId)) problems.push(`"${songId}" is already in the service.`);
    else if (!brief.offered.has(songId)) problems.push(`"${songId}" is not the id of a candidate.`);
    else if (!forInsert && isInsert(brief.songs.get(songId)!)) problems.push(`"${songId}" is an insert, and this is not an insert's place.`);
    else if (brief.christmasOnly && !brief.christmasOnly.has(songId)) problems.push(`"${songId}" is not established as a Christmas song.`);
    else if (!seen.has(songId) && suggestions.length < SUGGESTIONS) {
      seen.add(songId);
      const song = brief.songs.get(songId)!;
      const facts = candidateFacts(song, brief.startsAt);
      const words = reason.replace(/\s+/g, " ").trim();
      suggestions.push({
        title: song.title,
        number: song.number,
        key: facts.suggestedKey,
        reason: words.length > REASON_CHARS ? `${words.slice(0, REASON_CHARS - 1).trimEnd()}…` : words,
        lastSung: facts.lastSung,
      });
    }
  }

  if (suggestions.length === 0) return { ok: false, problems: problems.length > 0 ? problems : ["No song was suggested."] };
  return { ok: true, suggestions };
}
