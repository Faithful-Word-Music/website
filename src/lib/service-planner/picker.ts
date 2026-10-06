/**
 * What the song picker lists: the songs that answer what was typed, or - with
 * nothing typed - somewhere to start. Pure - unit tested; SongPicker.tsx
 * shows it.
 */

import { inChristmasSeason } from "@/lib/church-calendar";
import { songKey } from "@/lib/song-list";

import { candidateFacts, type CandidateSong } from "./intelligence";
import { isInsert } from "./model";

/** The most songs listed at once. */
export const PICKER_LIMIT = 60;

/** Sung at least this often, a song is familiar enough to suggest before anything is typed. */
const FAMILIAR_PLAYS = 3;

/** How well a song matches what was typed: lower is better, null is no match. */
export function matchRank(candidate: Pick<CandidateSong, "title" | "number" | "id">, query: string): number | null {
  const typed = query.trim().toLowerCase();
  if (typed === "") return 0;
  const number = typed.replace(/^(#|no\.?)\s*/, "");
  if (/^\d+[a-z]?$/.test(number) && candidate.number) {
    const own = candidate.number.toLowerCase();
    if (own === number) return 0;
    if (own.startsWith(number)) return 1;
  }
  const key = songKey(typed);
  if (key === "") return null;
  if (candidate.id === key) return 1;
  if (candidate.id.startsWith(key)) return 2;
  if (candidate.id.includes(key)) return 3;
  return null;
}

export interface PickerOptions {
  /** The service being planned (or, on the Inserts page, the week's Sunday): what "last sung" is counted from. */
  serviceStartsAt: string;
  /**
   * Choosing one of a week's inserts (the Inserts page): only songs that can
   * be one - those without a hymnal number - are listed, typed for or not.
   */
  only?: "inserts";
  /**
   * The service already has its insert, and this place is not it: the
   * starting list leaves inserts out, so another is not offered in passing.
   * It narrows the SUGGESTIONS only - typing a title still finds any song,
   * and any song can still be chosen.
   */
  hideInsertSuggestions?: boolean;
}

/** The songs to list for `query`, best first, at most PICKER_LIMIT. */
export function pickerResults(candidates: readonly CandidateSong[], query: string, options: PickerOptions): CandidateSong[] {
  const { serviceStartsAt } = options;
  const pool = options.only === "inserts" ? candidates.filter(isInsert) : candidates;

  if (query.trim() !== "") {
    return pool
      .map((candidate) => ({ candidate, rank: matchRank(candidate, query) }))
      .filter((item): item is { candidate: CandidateSong; rank: number } => item.rank !== null)
      .sort((a, b) => a.rank - b.rank || b.candidate.playCount - a.candidate.playCount || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, PICKER_LIMIT)
      .map(({ candidate }) => candidate);
  }

  // Nothing typed: songs not sung for the longest first - Christmas songs only in their season.
  const season = inChristmasSeason(serviceStartsAt.slice(0, 10));
  const lastSung = (candidate: CandidateSong) => candidateFacts(candidate, serviceStartsAt).lastSung ?? "";
  const inSeason = pool.filter((candidate) => season || !candidate.christmas);

  if (options.only === "inserts") {
    // Every insert the church has sung, the longest rested first, then the ones it has not.
    return [...inSeason]
      .sort((a, b) => Number(b.playCount > 0) - Number(a.playCount > 0) || lastSung(a).localeCompare(lastSung(b)) || a.id.localeCompare(b.id))
      .slice(0, PICKER_LIMIT);
  }

  return inSeason
    .filter((candidate) => candidate.playCount >= FAMILIAR_PLAYS && !(options.hideInsertSuggestions && isInsert(candidate)))
    .sort((a, b) => lastSung(a).localeCompare(lastSung(b)))
    .slice(0, PICKER_LIMIT);
}
