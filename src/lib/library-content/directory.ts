import { songKey } from "@/lib/song-list";
import { sameSong, songsForSlug, type SongReference } from "@/lib/song-identity";

/**
 * Finding the song a person means among the songs of the library index, and
 * keeping each indexed arrangement addressable. Pure functions. A shared
 * title is search evidence, never proof that two Song IDs are one work.
 */

/** As much of a library song as finding one needs (LibrarySong in store.ts has more). */
export interface DirectorySong {
  songId: string;
  title: string;
  /** songKey(title), for title searches only. */
  titleKey: string;
  collection: string | null;
  hymnNumber: string | null;
  status: "indexed" | "no_source" | "no_lyrics" | "failed";
}

/** "012" and "12" are the same number. */
const plainNumber = (value: string) => value.trim().replace(/^0+(?=\d)/, "").toLowerCase();

/**
 * Which copy of a song stands for it: one with lyrics before one without,
 * then the church's hymnal, then the songs it sings outside a hymnal (the
 * Psalms, Other Songs - they have no hymn number), then any other hymnal.
 */
function standing(song: DirectorySong, hymnal: string): number {
  const book = song.collection === hymnal ? 0 : song.hymnNumber === null ? 1 : 2;
  return (song.status === "indexed" ? 0 : 10) + book;
}

export function preferredCopy<T extends DirectorySong>(copies: readonly T[], hymnal: string): T {
  return [...copies].sort((a, b) => standing(a, hymnal) - standing(b, hymnal) || a.songId.localeCompare(b.songId))[0];
}

/** One song with every copy of it folded in. */
export interface FoldedSong<T extends DirectorySong> {
  song: T;
  /** The other books it is printed in. */
  alsoIn: string[];
}

/**
 * Copies of the same song folded into one entry each, in the order the first
 * copy of each appeared - so a ranked list stays ranked.
 */
export function foldCopies<T extends DirectorySong>(songs: readonly T[], hymnal: string): Array<FoldedSong<T>> {
  const groups = new Map<string, T[]>();
  for (const song of songs) {
    const identity = song.songId.toLowerCase();
    const group = groups.get(identity);
    if (group) group.push(song);
    else groups.set(identity, [song]);
  }
  return [...groups.values()].map((copies) => {
    const song = preferredCopy(copies, hymnal);
    const alsoIn = [...new Set(copies.filter((copy) => copy !== song && copy.collection && copy.collection !== song.collection).map((copy) => copy.collection!))];
    return { song, alsoIn };
  });
}

/** How many songs a search hands back when it cannot tell which is meant. */
export const LIBRARY_MATCHES = 8;

/**
 * The library song a person means by `query`: a title, part of one, or a
 * number in the church's hymnal. `match` is set only when one song fits;
 * otherwise the candidates are returned to be asked about, never chosen
 * between.
 */
export function resolveLibrarySong<T extends DirectorySong>(
  songs: readonly T[],
  query: string,
  hymnal: string,
): { match: FoldedSong<T> | null; candidates: Array<FoldedSong<T>> } {
  const text = query.trim();
  const key = songKey(text);
  if (text === "") return { match: null, candidates: [] };

  const identified = foldCopies(songs.filter((song) => song.songId.toLowerCase() === text.toLowerCase()), hymnal);
  if (identified.length === 1) return { match: identified[0], candidates: identified };
  const addressed = foldCopies(songsForSlug(text, songs.map((song) => ({ ...song, id: song.songId, number: song.hymnNumber }))), hymnal);
  if (addressed.length > 0) return { match: addressed.length === 1 ? addressed[0] : null, candidates: addressed.slice(0, LIBRARY_MATCHES) };

  const exact = foldCopies(songs.filter((song) => song.titleKey === key && key !== ""), hymnal);
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  if (exact.length > 1) return { match: null, candidates: exact.slice(0, LIBRARY_MATCHES) };

  // A number is a number in the church's own hymnal: that is how the song list is written.
  const number = /^(?:#|no\.?\s*|hymn\s*)?(\d+[a-z]?)$/i.exec(text)?.[1];
  if (number) {
    const numbered = foldCopies(
      songs.filter((song) => song.collection === hymnal && song.hymnNumber !== null && plainNumber(song.hymnNumber) === plainNumber(number)),
      hymnal,
    );
    if (numbered.length === 1) return { match: numbered[0], candidates: numbered };
    if (numbered.length > 1) return { match: null, candidates: numbered.slice(0, LIBRARY_MATCHES) };
  }

  if (key === "") return { match: null, candidates: [] };
  const found = foldCopies(songs.filter((song) => song.titleKey.includes(key)), hymnal).sort(
    (a, b) => a.song.titleKey.length - b.song.titleKey.length || a.song.title.localeCompare(b.song.title),
  );
  return { match: found.length === 1 ? found[0] : null, candidates: found.slice(0, LIBRARY_MATCHES) };
}

/**
 * Whether a library song is this song of the song list (a title and, for a
 * hymn, its number in the church's hymnal): how lyrics are tied to the
 * history of what has been sung.
 */
export function isSameSong(song: DirectorySong, listed: SongReference & { id: string }, hymnal: string): boolean {
  return sameSong(
    { songId: song.songId, title: song.title, number: song.hymnNumber, collection: song.collection },
    { ...listed, songId: listed.songId ?? listed.id },
    [],
    hymnal,
  );
}
