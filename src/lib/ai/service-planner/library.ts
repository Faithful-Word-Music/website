import { preferredCopy, type DirectorySong } from "@/lib/library-content/directory";
import type { CandidateSong } from "@/lib/service-planner/intelligence";

/**
 * Tying the planner's songs to the library's. Pure - unit tested.
 *
 * The planner knows a song by its title (songKey) and, for a hymn, its number
 * in the church's hymnal. The library index knows it by its Song ID, and may
 * hold several copies of one song (one in each book it is printed in). A plan
 * is made of the planner's songs, so everything the library finds - lyrics, a
 * search by meaning - is brought back to them here.
 */

/** "012" and "12" are the same number. */
const plain = (number: string) => number.trim().replace(/^0+(?=\d)/, "").toLowerCase();

export interface LibraryLinks<T extends DirectorySong> {
  /** The library's copy of a planner song (the one the church sings from), by candidate id. */
  songOf: Map<string, T>;
  /** The planner song a library song is, by Song ID. */
  candidateOf: Map<string, string>;
}

export function linkLibrary<T extends DirectorySong>(
  candidates: ReadonlyArray<Pick<CandidateSong, "id" | "number">>,
  library: readonly T[],
  hymnal: string,
): LibraryLinks<T> {
  const ids = new Set(candidates.map((song) => song.id));
  const byNumber = new Map<string, string>();
  for (const song of candidates) {
    if (song.number !== null && !byNumber.has(plain(song.number))) byNumber.set(plain(song.number), song.id);
  }

  const copies = new Map<string, T[]>();
  const candidateOf = new Map<string, string>();
  for (const song of library) {
    // By title first; a hymn written a little differently in the two places is still found by its number.
    const id = ids.has(song.titleKey)
      ? song.titleKey
      : song.collection === hymnal && song.hymnNumber !== null
        ? byNumber.get(plain(song.hymnNumber))
        : undefined;
    if (!id) continue;
    candidateOf.set(song.songId, id);
    copies.set(id, [...(copies.get(id) ?? []), song]);
  }

  return {
    songOf: new Map([...copies].map(([id, group]) => [id, preferredCopy(group, hymnal)])),
    candidateOf,
  };
}
