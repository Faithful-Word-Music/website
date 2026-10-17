import { identifySong, normalizeSongTitle, referenceEntries, songUrlSlug, type IdentityEntry, type SongReference } from "@/lib/song-identity";
import { songKey } from "@/lib/song-list";
import type { SongRecord } from "@/types/song-list";

/**
 * One song in the Library: what its entry in the index shows. Audio and other
 * resources for the song can be added here as they arrive.
 */
export interface LibrarySong {
  id: string;
  songId: string;
  collection: string | null;
  aliases?: readonly string[];
  legacySlugs?: string[];
  slug: string;
  title: string;
  number: string | null;
  /** True when its page has sheet music anyone may open. */
  sheetMusic: boolean;
}

/**
 * Every song with a page, A-Z: everything ever sung, plus songs only
 * scheduled so far - the same songs findSong() in song-archive.ts answers
 * for, so no link leads nowhere. Title and number are chosen as its page
 * chooses them: the archive's first, else the first scheduled listing's.
 */
export function buildLibrary(
  records: SongRecord[],
  upcoming: SongReference[],
  hasSheetMusic: (song: SongReference) => boolean = () => false,
  identities: readonly IdentityEntry[] = [],
): LibrarySong[] {
  const visibleEntries = identities;
  identities = referenceEntries([...records, ...upcoming], identities);
  const songs = new Map<string, Omit<LibrarySong, "sheetMusic">>();
  const add = (ref: SongReference & { aliases?: readonly string[] }) => {
    const song = identifySong(ref, identities);
    if (!song.songId) return;
    const known = songs.get(song.songId);
    if (!known) songs.set(song.songId, {
      id: song.songId, songId: song.songId, collection: song.collection ?? null,
      slug: songUrlSlug(song), title: song.title, number: song.number ?? null,
      aliases: ref.aliases,
      legacySlugs: [normalizeSongTitle(song.title).replace(/ /g, "-")],
    });
    else {
      known.number ??= song.number ?? null;
      const legacy = normalizeSongTitle(song.title).replace(/ /g, "-");
      if (!known.legacySlugs?.includes(legacy)) known.legacySlugs?.push(legacy);
    }
  };
  // Indexed spelling and number are authoritative for the current page.
  for (const entry of visibleEntries) add({ ...entry, songId: entry.id });
  for (const record of records) add(record);
  for (const song of upcoming) add(song);
  return [...songs.values()]
    .sort((a, b) => songKey(a.title).localeCompare(songKey(b.title)) || (a.collection ?? "").localeCompare(b.collection ?? "") || (a.number ?? "").localeCompare(b.number ?? "", undefined, { numeric: true }) || a.id.localeCompare(b.id))
    .map((song) => ({ ...song, sheetMusic: hasSheetMusic(song) }));
}

/** The letter a song is filed under: its first letter, or "#" for a digit. */
export function libraryLetter(title: string): string {
  const first = songKey(title).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}
