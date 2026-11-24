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
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function matches(id: string, entries: readonly PersonalDirectoryEntry[]): PersonalDirectoryEntry[] {
  const found = new Map<string, PersonalDirectoryEntry>();
  for (const entry of entries) {
    if (same(entry.id, id) || entry.aliases.some((alias) => !isLegacy(alias) && same(alias, id))) {
      found.set(entry.id.toLowerCase(), entry);
    }
  }
  return [...found.values()];
}

/** For a NEW record. Anything but `ok` must not be written. */
export function resolvePersonalSong(rawId: unknown, directory: PersonalDirectory): PersonalSongResolution {
  if (typeof rawId !== "string") return { status: "unknown" };
  const id = rawId.trim();
  if (!id || id.length > MAX_SONG_ID_LENGTH) return { status: "unknown" };
  if (isLegacy(id)) return { status: "not-durable" };
  if (directory.status !== "ok") return { status: "directory-unavailable" };

  const found = matches(id, directory.entries);
  if (found.length === 0) return { status: "unknown" };
  if (found.length > 1) return { status: "ambiguous" };
  const [entry] = found;
  const storedIds = [...new Set([entry.id, ...entry.aliases.filter((alias) => !isLegacy(alias))])];
  return { status: "ok", songId: entry.id, storedIds };
}

/**
 * How to show a record already stored. Never a reason to delete one: a song
 * can be missing today and back tomorrow, and `unknown` means we cannot tell.
 */
export function describeStoredSong(storedId: string, directory: PersonalDirectory): StoredSongState {
  if (directory.status !== "ok") return { state: "unknown" };
  const found = matches(storedId, directory.entries);
  if (found.length === 0) return { state: "unavailable" };
  if (found.length > 1) return { state: "ambiguous" };
  return { state: "available", songId: found[0].id };
}

/** The directory from the index's song IDs and the catalog's persisted rows. */
export function buildPersonalDirectory(
  indexIds: readonly string[],
  catalog: ReadonlyArray<{ songId: string; catalogId?: string }>,
): PersonalDirectory {
  const entries = new Map<string, { id: string; aliases: string[] }>();
  for (const id of indexIds) entries.set(id.toLowerCase(), { id, aliases: [] });
  for (const song of catalog) {
    const key = song.songId.toLowerCase();
    const entry = entries.get(key) ?? { id: song.songId, aliases: [] };
    entries.set(key, entry);
    if (song.catalogId && !same(song.catalogId, entry.id) && !entry.aliases.includes(song.catalogId)) {
      entry.aliases.push(song.catalogId);
    }
  }
  return { status: "ok", entries: [...entries.values()] };
}
