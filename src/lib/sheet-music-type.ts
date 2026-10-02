/**
 * Sheet music types: the kinds of sheet music the ministry keeps - Standard,
 * Standard (Chords), Capo (Chords) transposed for a capo, a clarinet part... -
 * and the one each person is given.
 *
 * Types are set up under Admin -> Configuration: a name, an order, and one or
 * more source folders in Drive. A file belongs to the type whose source holds
 * it (see classify in src/lib/sheet-music.ts), so the Drive folders can be
 * laid out however suits them; nothing about their layout is assumed.
 *
 * Each person's types are assigned by whoever looks after the sheet music
 * (manage_sheet_music), in order of preference - never worked out from their
 * instruments, because two people on the same instrument can need different
 * sheet music. A guitarist might have Capo (Chords), then Standard (Chords)
 * for the songs that need no capo. Each song uses the first of their types
 * it has (assignedFiles); a song with none of them shows as unavailable -
 * never a type outside their list.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import {
  ANYWHERE,
  splitSource,
  type IndexSong,
  type SheetFile,
  type SongVersion,
  type TypeSources,
} from "@/lib/sheet-music";

/** A type as configured, with its sources. */
export interface ConfiguredType extends TypeSources {
  /** "Standard|", "Chords|", "Capo|Guitar" for the types assignments were first made with; else null. */
  legacyKey: string | null;
}

/** A source as stored: its id, for removing it. */
export interface StoredSource {
  id: number;
  path: string[];
}

/**
 * The types a new database starts with, matching how the Drive folders were
 * laid out when types were introduced - and the types used when the list
 * cannot be read.
 */
export const DEFAULT_SHEET_MUSIC_TYPES: ReadonlyArray<{ label: string; legacyKey: string; sources: string[][] }> = [
  {
    label: "Standard",
    legacyKey: "Standard|",
    sources: [["01 - Congregational", ANYWHERE, "Standard"], ["03 - Ensemble & Classical"]],
  },
  {
    label: "Standard (Chords)",
    legacyKey: "Chords|",
    sources: [["01 - Congregational", ANYWHERE, "Chords", "Standard"]],
  },
  {
    label: "Capo (Chords)",
    legacyKey: "Capo|Guitar",
    sources: [["01 - Congregational", ANYWHERE, "Chords", "Capo"]],
  },
];

/** The defaults as configured types, for when the database cannot be read. */
export function defaultTypes(): ConfiguredType[] {
  return DEFAULT_SHEET_MUSIC_TYPES.map((type, index) => ({
    id: -(index + 1),
    label: type.label,
    legacyKey: type.legacyKey,
    legacyVariant: legacyVariant(type.legacyKey),
    sources: type.sources,
  }));
}

/** The older Versions-tab name in a legacy key: "Capo|Guitar" -> "Capo". */
export function legacyVariant(legacyKey: string | null): string | null {
  return legacyKey ? legacyKey.split("|")[0] || null : null;
}

/**
 * A source in words: the folder, "02 - Instrument Parts › Clarinet › Bb" - or,
 * for a starting type not yet turned into folders, 'Every "Chords › Capo"
 * folder inside 01 - Congregational'.
 */
export function describeSource(source: readonly string[]): string {
  const { inside, every } = splitSource(source);
  if (!every) return inside.join(" › ");
  return `Every "${every.join(" › ")}" folder inside ${inside.length > 0 ? inside.join(" › ") : "Sheet Music"}`;
}

/**
 * The PDF of exactly this type for a song, among the files the person may
 * open - version 1 when there are several - or null. Never another type.
 */
export function fileOfType(
  song: IndexSong,
  typeId: number,
  mayOpen: (file: SheetFile) => boolean,
): { version: SongVersion; file: SheetFile } | null {
  const matches = song.versions
    .filter((version) => version.typeId === typeId)
    .flatMap((version) =>
      version.files.filter((file) => file.format === "pdf" && mayOpen(file)).map((file) => ({ version, file })),
    );
  return matches.find(({ version }) => version.version === "1") ?? matches[0] ?? null;
}

/**
 * A person's sheet music for a song: the PDF of each of their types (see
 * fileOfType) that the song has, in their order of preference. The first is
 * the one to show and the rest are the alternatives; none means the song has
 * none of their types. A type with only a MuseScore file, or only files they
 * may not open, is passed over for the next.
 */
export function assignedFiles(
  song: IndexSong,
  typeIds: readonly number[],
  mayOpen: (file: SheetFile) => boolean,
): Array<{ version: SongVersion; file: SheetFile }> {
  return typeIds.flatMap((typeId) => fileOfType(song, typeId, mayOpen) ?? []);
}

/** How many songs have a file of the type. */
export function songCount(songs: readonly IndexSong[], typeId: number): number {
  return songs.filter((song) => song.versions.some((version) => version.typeId === typeId)).length;
}
