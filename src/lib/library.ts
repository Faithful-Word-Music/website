import { songKey, songSlug } from "@/lib/song-list";
import type { SongRecord } from "@/types/song-list";

/**
 * One song in the Library: what its entry in the index shows. Audio and other
 * resources for the song can be added here as they arrive.
 */
export interface LibrarySong {
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
  upcoming: Array<{ title: string; number: string | null }>,
  hasSheetMusic: (song: { title: string; number: string | null }) => boolean = () => false,
): LibrarySong[] {
  const songs = new Map<string, Omit<LibrarySong, "sheetMusic">>();

  for (const record of records) {
    const slug = songSlug(record.title);
    if (!songs.has(slug)) songs.set(slug, { slug, title: record.title, number: record.number });
  }

  for (const song of upcoming) {
    const slug = songSlug(song.title);
    const known = songs.get(slug);
    if (!known) songs.set(slug, { slug, title: song.title, number: song.number });
    else known.number ??= song.number;
  }

  return [...songs.values()]
    .sort((a, b) => songKey(a.title).localeCompare(songKey(b.title)))
    .map((song) => ({ ...song, sheetMusic: hasSheetMusic(song) }));
}

/** The letter a song is filed under: its first letter, or "#" for a digit. */
export function libraryLetter(title: string): string {
  const first = songKey(title).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}
