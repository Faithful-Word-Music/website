/**
 * "New sheet music": songs whose sheet music was added or changed in Drive
 * recently, among the files this person may open - upcoming songs first.
 * Only songs that have a page are listed, so every entry leads somewhere.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { matchIndexSong, type IndexSong, type SheetFile, type SheetMusicIndex } from "@/lib/sheet-music";
import { songKey, songSlug } from "@/lib/song-list";

/** "Recently" means within this many days. */
export const NEW_SHEET_DAYS = 14;
export const NEW_SHEET_LIMIT = 6;

const DAY_MS = 86_400_000;

export interface NewSheetSong {
  title: string;
  /** Its hymnal number, if it has one. */
  number: string | null;
  slug: string;
  /** The latest change among its files. */
  changedAt: string;
  /** Whether it is in an upcoming service. */
  upcoming: boolean;
}

export function newSheetMusic(
  /** Every song with a page: sung before, or scheduled. */
  songs: ReadonlyArray<{ title: string; number: string | null }>,
  upcomingKeys: ReadonlySet<string>,
  index: SheetMusicIndex,
  hymnalCollection: string,
  mayOpen: (song: IndexSong, file: SheetFile) => boolean,
  now: number,
): NewSheetSong[] {
  const since = now - NEW_SHEET_DAYS * DAY_MS;
  const seen = new Set<string>();
  const result: NewSheetSong[] = [];

  for (const song of songs) {
    const key = songKey(song.title);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    const indexSong = matchIndexSong(index, song, hymnalCollection);
    if (!indexSong) continue;

    const latest = indexSong.versions
      .flatMap((version) => version.files)
      .filter((file) => mayOpen(indexSong, file) && file.modifiedTime && Date.parse(file.modifiedTime) >= since)
      .map((file) => file.modifiedTime!)
      .sort()
      .at(-1);
    if (latest) {
      result.push({
        title: song.title,
        number: song.number,
        slug: songSlug(song.title),
        changedAt: latest,
        upcoming: upcomingKeys.has(key),
      });
    }
  }

  return result
    .sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || Date.parse(b.changedAt) - Date.parse(a.changedAt))
    .slice(0, NEW_SHEET_LIMIT);
}
