/**
 * "Sheet music to finish": the songs in the next three services whose
 * sheet music is missing or incomplete, for the people who look after sheet
 * music (manage_sheet_music).
 *
 * What counts as a gap, per song:
 *   - no entry in the Sheet Music Index at all;
 *   - an entry, but no files in Drive;
 *   - no sheet music of the first type (Admin -> Configuration; by
 *     default Standard), while other types have some;
 *   - a type and version with a MuseScore file but no PDF - "some PDFs are
 *     there, but not all";
 *   - rights not settled (Copyrighted? is "Needs Review" or blank), which
 *     keeps the files from the public.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { fileLabel, matchIndexSong, type IndexSong, type SheetMusicIndex } from "@/lib/sheet-music";
import { songKey, songSlug } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

export type SheetGap =
  | { kind: "no-entry" }
  | { kind: "no-files" }
  | { kind: "no-main-type"; type: string }
  | { kind: "missing-pdf"; types: string[] }
  | { kind: "rights" };

export interface SongSheetGaps {
  title: string;
  number: string | null;
  slug: string;
  /** The first upcoming service it is in. */
  firstStartsAt: string;
  gaps: SheetGap[];
}

/** The gaps in one song's sheet music; `mainType` is the first type in the list, if any. */
export function gapsFor(song: IndexSong | null, mainType: { id: number; label: string } | null): SheetGap[] {
  if (!song) return [{ kind: "no-entry" }];
  const gaps: SheetGap[] = [];
  const files = song.versions.flatMap((version) => version.files);
  if (files.length === 0) gaps.push({ kind: "no-files" });
  else {
    if (mainType && !song.versions.some((version) => version.typeId === mainType.id && version.files.length > 0)) {
      gaps.push({ kind: "no-main-type", type: mainType.label });
    }
    // Each version of each type should have a PDF.
    const missing = song.versions
      .filter((version) => !version.files.some((file) => file.format === "pdf"))
      .map(fileLabel);
    if (missing.length > 0) gaps.push({ kind: "missing-pdf", types: missing });
  }
  if (song.rights === "needs-review" || song.rights === "unknown") gaps.push({ kind: "rights" });
  return gaps;
}

/**
 * How many upcoming services are checked. Only the next few matter: a month
 * being planned ahead should not fill the list with songs weeks away.
 */
export const GAP_SERVICES = 3;

/** Every song with a gap in the next GAP_SERVICES services, once each, in the order they come up. */
export function findSheetGaps(
  upcoming: readonly DatedService[],
  index: SheetMusicIndex,
  hymnalCollection: string,
): SongSheetGaps[] {
  const seen = new Set<string>();
  const result: SongSheetGaps[] = [];
  const ordered = [...upcoming]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, GAP_SERVICES);

  for (const service of ordered) {
    for (const song of service.songs) {
      const key = songKey(song.title);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const gaps = gapsFor(matchIndexSong(index, song, hymnalCollection), index.types[0] ?? null);
      if (gaps.length > 0) {
        result.push({
          title: song.title,
          number: song.number,
          slug: songSlug(song.title),
          firstStartsAt: service.startsAt,
          gaps,
        });
      }
    }
  }
  return result;
}
