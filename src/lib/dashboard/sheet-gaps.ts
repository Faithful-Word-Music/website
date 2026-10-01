/**
 * "Sheet music to finish": the songs in the next three services whose
 * sheet music is missing or incomplete, for the people who look after sheet
 * music (manage_sheet_music).
 *
 * What counts as a gap, per song:
 *   - no entry in the Sheet Music Index at all;
 *   - an entry, but no files in Drive;
 *   - no Standard score, while other charts exist;
 *   - a chart (Standard, Chords, Capo, a part) with a MuseScore file but no
 *     PDF - "some PDFs are there, but not all";
 *   - rights not settled (Copyrighted? is "Needs Review" or blank), which
 *     keeps the files from the public.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { matchIndexSong, type IndexSong, type SheetMusicIndex } from "@/lib/sheet-music";
import { songKey, songSlug } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

export type SheetGap =
  | { kind: "no-entry" }
  | { kind: "no-files" }
  | { kind: "no-standard" }
  | { kind: "missing-pdf"; charts: string[] }
  | { kind: "rights" };

export interface SongSheetGaps {
  title: string;
  number: string | null;
  slug: string;
  /** The first upcoming service it is in. */
  firstStartsAt: string;
  gaps: SheetGap[];
}

/** "Capo", "Chords, Version 2", "Standard - Violin". */
function chartName(variant: string, version: string, instrument: string | null): string {
  const name = version === "1" ? variant : `${variant}, Version ${version}`;
  return instrument ? `${name} - ${instrument}` : name;
}

export function gapsFor(song: IndexSong | null): SheetGap[] {
  if (!song) return [{ kind: "no-entry" }];
  const gaps: SheetGap[] = [];
  const files = song.versions.flatMap((version) => version.files);
  if (files.length === 0) gaps.push({ kind: "no-files" });
  else {
    if (!song.versions.some((version) => version.variant.toLowerCase() === "standard" && version.files.length > 0)) {
      gaps.push({ kind: "no-standard" });
    }
    // A chart is one variant + version + instrument; it should have a PDF.
    const charts = new Map<string, boolean>();
    for (const version of song.versions) {
      for (const file of version.files) {
        const name = chartName(version.variant, version.version, file.instrument);
        charts.set(name, (charts.get(name) ?? false) || file.format === "pdf");
      }
    }
    const missing = [...charts].filter(([, hasPdf]) => !hasPdf).map(([name]) => name);
    if (missing.length > 0) gaps.push({ kind: "missing-pdf", charts: missing });
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
      const gaps = gapsFor(matchIndexSong(index, song, hymnalCollection));
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
