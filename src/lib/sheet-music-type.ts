/**
 * Sheet music types: the kinds of chart the ministry keeps - the Standard
 * score, the Chords chart, the Capo chart for guitar, a violin part... - and
 * the one each person is given.
 *
 * Types are not a list anyone keeps by hand: they are read from the Drive
 * folders (a variant, plus the instrument for a part or the capo chart), so
 * a new kind of chart appears as soon as its first file is added.
 *
 * Each person's type is assigned by whoever looks after the sheet music
 * (manage_sheet_music) - never worked out from their instruments, because
 * two people on the same instrument can need different charts. Their
 * Dashboard then links only that type, and nothing at all when a song has no
 * file of that type.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { IndexSong, SheetFile, SheetMusicIndex, SongVersion } from "@/lib/sheet-music";

export interface SheetMusicType {
  /** "Standard", "Chords", "Capo"... as the folders name it. */
  variant: string;
  /** The instrument, for a part or the capo chart; null for a congregational chart. */
  instrument: string | null;
}

/** "Capo - Guitar", "Standard", "Standard - Violin". */
export function typeLabel(type: SheetMusicType): string {
  return type.instrument ? `${type.variant} - ${type.instrument}` : type.variant;
}

/** A stable string for a form value: "Capo|Guitar", "Standard|". */
export function typeKey(type: SheetMusicType): string {
  return `${type.variant}|${type.instrument ?? ""}`;
}

export function sameType(a: SheetMusicType, b: SheetMusicType): boolean {
  return (
    a.variant.toLowerCase() === b.variant.toLowerCase() &&
    (a.instrument ?? "").toLowerCase() === (b.instrument ?? "").toLowerCase()
  );
}

/** The type a file is, within its version. */
export function typeOf(version: SongVersion, file: SheetFile): SheetMusicType {
  return { variant: version.variant, instrument: file.instrument };
}

/**
 * Every type the Index has a file for, congregational charts first
 * (Standard, then Chords, Capo... A-Z), then instrument parts A-Z.
 */
export function availableTypes(index: SheetMusicIndex): SheetMusicType[] {
  const found = new Map<string, SheetMusicType>();
  for (const song of index.songs) {
    for (const version of song.versions) {
      for (const file of version.files) {
        const type = typeOf(version, file);
        const key = typeKey(type).toLowerCase();
        if (!found.has(key)) found.set(key, type);
      }
    }
  }
  const rank = (type: SheetMusicType) =>
    type.variant.toLowerCase() === "standard" && type.instrument === null ? 0 : type.instrument === null ? 1 : 2;
  return [...found.values()].sort(
    (a, b) => rank(a) - rank(b) || typeLabel(a).localeCompare(typeLabel(b), undefined, { sensitivity: "base" }),
  );
}

/**
 * The PDF of exactly this type for a song, among the files the person may
 * open - version 1 when there are several - or null. Never another type.
 */
export function fileOfType(
  song: IndexSong,
  type: SheetMusicType,
  mayOpen: (file: SheetFile) => boolean,
): { version: SongVersion; file: SheetFile } | null {
  const matches = song.versions.flatMap((version) =>
    version.files
      .filter((file) => file.format === "pdf" && sameType(typeOf(version, file), type) && mayOpen(file))
      .map((file) => ({ version, file })),
  );
  return matches.find(({ version }) => version.version === "1") ?? matches[0] ?? null;
}
