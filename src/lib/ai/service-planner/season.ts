import { addDays } from "@/lib/availability/occurrences";
import { easter, inChristmasSeason, thanksgiving } from "@/lib/church-calendar";
import type { CandidateSong } from "@/lib/service-planner/intelligence";
import { songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

/**
 * The church's seasons as the plan generator needs them. Pure - unit tested.
 *
 * WHAT is sung in a season is the Music Director's planning philosophy
 * (src/content/music-planning-philosophy.md), which the model reads whole.
 * This file only does the two things a prompt cannot be trusted with:
 *
 *   1. saying WHICH season a service falls in, from the calendar, so the right
 *      songs are among the candidates and the model is told the dates;
 *   2. ENFORCING the one seasonal rule the philosophy states as hard: in the
 *      Christmas season a service uses only Christmas songs. A generated plan
 *      is checked against it in code (validate.ts), not left to the model.
 *
 * The Christmas season is the site's own (church-calendar.ts): the day after
 * Thanksgiving to December 25.
 */

export type ServiceSeason = "christmas" | "thanksgiving" | "before-easter" | "easter";

/** The season a service on `date` falls in, or null for an ordinary one. */
export function serviceSeason(date: string): ServiceSeason | null {
  if (inChristmasSeason(date)) return "christmas";
  const year = Number(date.slice(0, 4));

  // The Sunday and the Wednesday before Thanksgiving Day (a Thursday), and the day itself.
  const thursday = thanksgiving(year);
  if (date >= addDays(thursday, -4) && date <= thursday) return "thanksgiving";

  const sunday = easter(year);
  if (date === sunday) return "easter";
  if (date >= addDays(sunday, -7) && date < sunday) return "before-easter";
  return null;
}

/**
 * What the library is searched for (by meaning) in a season, so its songs are
 * among the candidates. A search key, nothing more: it decides which songs
 * the model may look at, never which it should choose.
 */
export const SEASON_SEARCH: Record<Exclude<ServiceSeason, "christmas">, string> = {
  thanksgiving: "Thanksgiving: giving thanks to God, gratitude for His blessings",
  "before-easter": "the death and crucifixion of Jesus Christ on the cross",
  easter: "the resurrection of Jesus Christ: He is risen from the grave",
};

/**
 * Words that place a song at the Nativity. Deliberately few and unmistakable:
 * a song is only taken for a Christmas song on their evidence when it has
 * also never been sung at any other time of year.
 */
export const NATIVITY_WORDS = ["christmas", "bethlehem", "manger", "noel", "nowell", "magi", "shepherds"] as const;

/**
 * The songs that may be put into a service in the Christmas season: those
 * whose being Christmas songs can be established from what the site holds.
 *
 *   never sung outside the season, AND
 *     - sung in it (the records: it has only ever been a Christmas song), OR
 *     - its own indexed lyrics name the Nativity (`nativity`)
 *
 * Conservative on purpose. A carol nobody has sung here and whose lyrics are
 * not indexed is left out: it can still be chosen by hand, but AI will not
 * put it in. A hymn that mentions Bethlehem but is sung all year is left out
 * too.
 */
export function christmasEligible(input: {
  candidates: readonly CandidateSong[];
  past: readonly DatedService[];
  /** Candidate ids whose lyrics contain one of NATIVITY_WORDS. */
  nativity: ReadonlySet<string>;
}): Set<string> {
  const outOfSeason = new Set<string>();
  const inSeason = new Set<string>();
  for (const service of input.past) {
    const target = inChristmasSeason(service.date) ? inSeason : outOfSeason;
    for (const song of service.songs) target.add(songKey(song.title));
  }
  return new Set(
    input.candidates
      .filter((candidate) => !outOfSeason.has(candidate.id) && (inSeason.has(candidate.id) || input.nativity.has(candidate.id)))
      .map((candidate) => candidate.id),
  );
}
