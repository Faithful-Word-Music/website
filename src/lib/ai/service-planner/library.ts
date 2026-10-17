import type { DirectorySong } from "@/lib/library-content/directory";
import type { CandidateSong } from "@/lib/service-planner/intelligence";
import { resolveSong } from "@/lib/song-identity";

/**
 * Tying the planner's songs to the library's. Pure - unit tested.
 *
 * Explicit Song IDs take priority. A legacy candidate can be associated only
 * when its collection/number or unique title resolves in the complete lyric
 * directory. Different indexed copies retain independent associations.
 */

export interface LibraryLinks<T extends DirectorySong> {
  /** The library's copy of a planner song (the one the church sings from), by candidate id. */
  songOf: Map<string, T>;
  /** The planner song a library song is, by Song ID. */
  candidateOf: Map<string, string>;
}

export function linkLibrary<T extends DirectorySong>(
  candidates: ReadonlyArray<Pick<CandidateSong, "id" | "title" | "number" | "collection"> & { songId?: string }>,
  library: readonly T[],
  hymnal: string,
): LibraryLinks<T> {
  const entries = library.map((song) => ({ ...song, id: song.songId, number: song.hymnNumber }));
  const songOf = new Map<string, T>();
  const candidateOf = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const candidate of candidates) {
    // This is a read-only bridge from unresolved numbered evidence to the
    // lyric index. A canonical or catalog ID is never discarded.
    const reference = /^legacy-n-[0-9a-f]+$/i.test(candidate.songId ?? "")
      ? { ...candidate, songId: undefined }
      : candidate;
    const found = resolveSong(reference, entries, hymnal);
    if (!found) continue;
    if (ambiguous.has(found.songId)) continue;
    songOf.set(candidate.id, found);
    // More than one candidate claiming the same directory identity is
    // ambiguous too; never assign a search hit to whichever came last.
    const prior = candidateOf.get(found.songId);
    if (prior && prior !== candidate.id) {
      candidateOf.delete(found.songId);
      songOf.delete(prior);
      songOf.delete(candidate.id);
      ambiguous.add(found.songId);
    } else candidateOf.set(found.songId, candidate.id);
  }
  return { songOf, candidateOf };
}
