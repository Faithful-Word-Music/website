/**
 * Which song a Personal Library record belongs to. Pure.
 *
 * Stricter than songIdentity() on purpose. That function must give every
 * historical record some identity, including a title or legacy evidence. A
 * private record needs one that lasts, so a new record is accepted only for a
 * current index ID, a persisted catalog ID, or a persisted catalog alias.
 *
 * Stored keys are never rewritten. When a catalog song is later linked to an
 * index song, both spellings resolve to one song through `storedIds`.
 */

export const MAX_SONG_ID_LENGTH = 200;

export interface PersonalDirectoryEntry {
  id: string;
  /** Persisted associations only, never identities derived from a title or number. */
  aliases: readonly string[];
}

export type PersonalDirectory =
  | { status: "ok"; entries: readonly PersonalDirectoryEntry[] }
  /** The song sources could not be read. Says nothing about whether a song exists. */
  | { status: "unavailable" };

export type PersonalSongResolution =
  | { status: "ok"; songId: string; storedIds: string[] }
  | { status: "unknown" | "ambiguous" | "not-durable" | "directory-unavailable" };

export type StoredSongState =
  | { state: "available"; songId: string }
  | { state: "unavailable" | "ambiguous" | "unknown" };

const isLegacy = (id: string) => /^legacy-[nt]-/i.test(id);

/**
 * The one comparison for song IDs, here and in storage (FOLDED_SONG_ID in
 * store.ts). ASCII only, on purpose: JavaScript's and PostgreSQL's lowercase
 * differ outside ASCII (the Kelvin sign becomes "k" in one), and a mismatch
 * could put another song's record inside a delete.
 */
export function foldSongId(id: string): string {
  return id.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

type Claims = ReadonlyMap<string, readonly PersonalDirectoryEntry[]>;
const claimsByEntries = new WeakMap<readonly PersonalDirectoryEntry[], Claims>();

/** Which songs claim each spelling. Built once per directory, so a lookup is constant time. */
function claimsOf(entries: readonly PersonalDirectoryEntry[]): Claims {
  const known = claimsByEntries.get(entries);
  if (known) return known;
  const claims = new Map<string, PersonalDirectoryEntry[]>();
  for (const entry of entries) {
    for (const spelling of [entry.id, ...entry.aliases.filter((alias) => !isLegacy(alias))]) {
      const key = foldSongId(spelling);
      const claimants = claims.get(key) ?? [];
      if (!claimants.some((claimant) => claimant.id === entry.id)) claimants.push(entry);
      claims.set(key, claimants);
    }
  }
  claimsByEntries.set(entries, claims);
  return claims;
}

/**
 * The one song this spelling belongs to. A song whose own ID is also claimed
 * by another song is ambiguous under every spelling, because a record stored
 * under that ID could be either's.
 */
function findEntry(id: string, entries: readonly PersonalDirectoryEntry[]): PersonalDirectoryEntry | "ambiguous" | null {
  const claims = claimsOf(entries);
  const found = claims.get(foldSongId(id)) ?? [];
  if (found.length === 0) return null;
  if (found.length > 1) return "ambiguous";
  return (claims.get(foldSongId(found[0].id)) ?? []).length > 1 ? "ambiguous" : found[0];
}

/** For a NEW record. Anything but `ok` must not be written. */
export function resolvePersonalSong(rawId: unknown, directory: PersonalDirectory): PersonalSongResolution {
  if (typeof rawId !== "string") return { status: "unknown" };
  const id = rawId.trim();
  if (!id || id.length > MAX_SONG_ID_LENGTH) return { status: "unknown" };
  if (isLegacy(id)) return { status: "not-durable" };
  if (directory.status !== "ok") return { status: "directory-unavailable" };

  const entry = findEntry(id, directory.entries);
  if (entry === null) return { status: "unknown" };
  if (entry === "ambiguous") return { status: "ambiguous" };
  // Only spellings no other song claims, so a change to this song cannot reach another's record.
  const claims = claimsOf(directory.entries);
  const own = entry.aliases.filter((alias) => !isLegacy(alias) && claims.get(foldSongId(alias))?.length === 1);
  return { status: "ok", songId: entry.id, storedIds: [...new Set([entry.id, ...own])] };
}

/**
 * How to show a record already stored. Never a reason to delete one: a song
 * can be missing today and back tomorrow, and `unknown` means we cannot tell.
 */
export function describeStoredSong(storedId: string, directory: PersonalDirectory): StoredSongState {
  if (directory.status !== "ok") return { state: "unknown" };
  const entry = findEntry(storedId, directory.entries);
  if (entry === null) return { state: "unavailable" };
  if (entry === "ambiguous") return { state: "ambiguous" };
  return { state: "available", songId: entry.id };
}

/**
 * The directory from the index's song IDs and the catalog's persisted rows.
 * Two IDs differing only by case stay two entries, and so resolve as ambiguous
 * rather than one silently replacing the other. A catalog row joins an entry
 * by exact ID, or by a case variant only when exactly one entry has it.
 */
export function buildPersonalDirectory(
  indexIds: readonly string[],
  catalog: ReadonlyArray<{ songId: string; catalogId?: string }>,
): PersonalDirectory {
  const exact = new Map<string, { id: string; aliases: string[] }>();
  const byFold = new Map<string, Array<{ id: string; aliases: string[] }>>();
  const add = (id: string) => {
    const entry = { id, aliases: [] as string[] };
    exact.set(id, entry);
    byFold.set(foldSongId(id), [...(byFold.get(foldSongId(id)) ?? []), entry]);
    return entry;
  };
  for (const id of indexIds) if (!exact.has(id)) add(id);
  for (const song of catalog) {
    const variants = byFold.get(foldSongId(song.songId)) ?? [];
    const entry = exact.get(song.songId) ?? (variants.length === 1 ? variants[0] : add(song.songId));
    if (song.catalogId && song.catalogId !== entry.id && !entry.aliases.includes(song.catalogId)) {
      entry.aliases.push(song.catalogId);
    }
  }
  return { status: "ok", entries: [...exact.values()] };
}
