import { siteConfig } from "@/config/site";

/** A reference, never a display title used as a database key. Old records may lack identity. */
export interface SongReference {
  songId?: string;
  collection?: string | null;
  title: string;
  number?: string | null;
}

export interface IdentityEntry {
  id: string;
  title: string;
  number: string | null;
  collection: string | null;
  /** Persisted explicit associations, e.g. a migrated catalog UUID. */
  aliases?: readonly string[];
  legacySlugs?: readonly string[];
}

export const normalizeSongTitle = (title: string): string => title.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const normalizeSongNumber = (number: string): string => number.trim().replace(/^0+(?=\d)/, "").toLowerCase();
const titleSlug = (title: string) => normalizeSongTitle(title).replace(/ /g, "-");
const defaultCollection = siteConfig.sheetMusic.hymnalCollection;
const equalId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const unique = <T extends IdentityEntry>(entries: readonly T[]): T | null => {
  const ids = new Map(entries.map((entry) => [entry.id.toLowerCase(), entry]));
  return ids.size === 1 ? [...ids.values()][0] : null;
};

/**
 * Resolution policy: explicit identity is final, including a missing identity.
 * Otherwise use collection + number (the configured hymnal for old numbered
 * records), then a unique title. Conflicting numbers and ambiguous matches do
 * not fall through to a title. A performed key is never identity evidence.
 */
export function resolveSong<T extends IdentityEntry>(
  ref: SongReference,
  entries: readonly T[],
  hymnalCollection: string = defaultCollection,
): T | null {
  if (ref.songId) return unique(entries.filter((entry) => equalId(entry.id, ref.songId!) || entry.aliases?.some((alias) => equalId(alias, ref.songId!))));
  const collection = ref.collection ?? (ref.number ? hymnalCollection : null);
  if (ref.number) {
    return unique(entries.filter((entry) => entry.collection === collection && entry.number !== null &&
      normalizeSongNumber(entry.number) === normalizeSongNumber(ref.number!)));
  }
  const title = normalizeSongTitle(ref.title);
  if (!title) return null;
  return unique(entries.filter((entry) => normalizeSongTitle(entry.title) === title &&
    (!collection || entry.collection === collection)));
}

// Reversible evidence encoding: no hash collisions, locale dependence or browser-only APIs.
const hex = (text: string) => [...new TextEncoder().encode(text)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** Stable unresolved identity, not an assertion that an indexed arrangement was sung. */
export function songIdentity(ref: SongReference, entries: readonly IdentityEntry[] = [], hymnalCollection: string = defaultCollection): string {
  if (ref.songId) return resolveSong(ref, entries, hymnalCollection)?.id ?? ref.songId;
  const matched = resolveSong(ref, entries, hymnalCollection);
  if (matched) return matched.id;
  if (ref.number) return `legacy-n-${hex(JSON.stringify([ref.collection ?? hymnalCollection, normalizeSongNumber(ref.number)]))}`;
  // Keep the historic unnumbered title key as an explicitly unresolved legacy
  // identity. New catalog entries always have a persisted UUID instead. A
  // collection, when recorded, is still part of the unresolved evidence.
  return ref.collection ? `legacy-t-${hex(JSON.stringify([ref.collection, normalizeSongTitle(ref.title)]))}` : normalizeSongTitle(ref.title);
}

export function identifySong<T extends SongReference>(ref: T, entries: readonly IdentityEntry[] = [], hymnalCollection: string = defaultCollection): T & { songId: string } {
  return { ...ref, songId: songIdentity(ref, entries, hymnalCollection) };
}

export function sameSong(a: SongReference, b: SongReference, entries: readonly IdentityEntry[] = [], hymnalCollection: string = defaultCollection): boolean {
  return equalId(songIdentity(a, entries, hymnalCollection), songIdentity(b, entries, hymnalCollection));
}

/** Private index fields never leave this adapter. */
export function indexEntries(songs: ReadonlyArray<{ id: string; title: string; hymnNumber: string | null; collection: string | null }>): IdentityEntry[] {
  return songs.map(({ id, title, hymnNumber: number, collection }) => ({ id, title, number, collection,
    // Older link callers carry number/collection evidence but no explicit ID.
    // Retain those evidence URLs as aliases to their now-known arrangement.
    aliases: number ? [songIdentity({ title, number, collection })] : [],
  }));
}

/** Existing numbered/explicit references are evidence for older unnumbered
 * spellings only when they identify exactly one entry. No stored data changes. */
export function referenceEntries(refs: readonly SongReference[], known: readonly IdentityEntry[] = [], hymnalCollection: string = defaultCollection): IdentityEntry[] {
  const result = [...known];
  const seen = new Set(known.map((entry) => `${entry.id.toLowerCase()}\0${normalizeSongTitle(entry.title)}`));
  const distinct = new Map<string, SongReference>();
  for (const ref of refs) if (ref.songId || ref.number) {
    const key = JSON.stringify([ref.songId, ref.collection, ref.number, normalizeSongTitle(ref.title)]);
    if (!distinct.has(key)) distinct.set(key, ref);
  }
  const add = (ref: SongReference, evidence: readonly IdentityEntry[]) => {
    const match = resolveSong(ref, evidence, hymnalCollection);
    const id = match?.id ?? songIdentity(ref, [], hymnalCollection);
    const key = `${id.toLowerCase()}\0${normalizeSongTitle(ref.title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ id, title: ref.title, number: match ? match.number : ref.number ?? null, collection: match ? match.collection : ref.collection ?? (ref.number ? hymnalCollection : null) });
  };
  // Resolve raw records against all explicit existing associations, regardless
  // of service order. Do not create a competing fallback for the same number.
  for (const ref of distinct.values()) if (ref.songId) add(ref, known);
  const associated = [...result];
  for (const ref of distinct.values()) if (!ref.songId) add(ref, associated);
  return result;
}

/** IDs admitted by the index are alphanumeric hyphen-separated segments, of any length. */
export function songUrlSlug(ref: SongReference): string {
  const id = songIdentity(ref);
  // Catalog and legacy IDs use the same safe alphabet. Encode arbitrary older IDs
  // losslessly rather than stripping punctuation and accidentally sharing a route.
  const suffix = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(id) ? id.toLowerCase() : `identity-${hex(id)}`;
  return `${titleSlug(ref.title) || "song"}-${suffix}`;
}

/**
 * Resolve the FULL known ID suffix, longest first. Never split a Song ID at
 * its last hyphen (PS-019-7-10 is valid). Titles can change without breaking
 * an ID URL. A title-only legacy URL returns every possible destination so
 * callers can present a choice, rather than pick an arrangement arbitrarily.
 */
export function songsForSlug<T extends IdentityEntry>(slug: string, entries: readonly T[]): T[] {
  const suffixMatches = entries.flatMap((entry) => [entry.id, ...(entry.aliases ?? [])].flatMap((id) => {
    const suffix = songUrlSlug({ title: "song", songId: id }).slice(5);
    return slug.toLowerCase().endsWith(`-${suffix}`) ? [{ entry, length: suffix.length }] : [];
  })).sort((a, b) => b.length - a.length);
  if (suffixMatches.length) {
    const longest = suffixMatches[0].length;
    return [...new Map(suffixMatches.filter((match) => match.length === longest).map(({ entry }) => [entry.id, entry])).values()];
  }
  // Old callers may know only an unnumbered title. Its lossless unresolved
  // suffix can resolve to a unique current entry (or expose the ambiguity).
  // A real unresolved record above still wins its own exact identity URL.
  const evidence = entries.filter((entry) => slug.toLowerCase().endsWith(`-${songUrlSlug({ title: "song", songId: normalizeSongTitle(entry.title) }).slice(5)}`));
  if (evidence.length) return evidence;
  return entries.filter((entry) => titleSlug(entry.title) === slug.toLowerCase() || entry.legacySlugs?.includes(slug.toLowerCase()));
}
