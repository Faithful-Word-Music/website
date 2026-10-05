import type { IndexSong } from "@/lib/sheet-music";

/**
 * Deciding what a refresh of the library index has to do for each song -
 * WITHOUT opening a file. Everything here is worked out from the one cached
 * listing of Drive (name, when it changed, its checksum) against what the
 * index already holds, so an unchanged library costs no downloads and no
 * embeddings at all. Pure functions.
 */

/** The MuseScore file a song's lyrics are read from. */
export interface SongSource {
  driveFileId: string;
  /** ISO; null when Drive did not say. */
  modifiedTime: string | null;
  /** Drive's checksum of the bytes; null when Drive did not say. */
  md5: string | null;
}

export type IndexStatus =
  /** Lyrics read and kept. */
  | "indexed"
  /** The song has no MuseScore file of the lyrics type. */
  | "no_source"
  /** Its MuseScore file has no lyrics in it (an instrumental piece, or words never typed in). */
  | "no_lyrics"
  /** The file could not be fetched or read. Tried again at every refresh. */
  | "failed";

/** What the index remembers of a song, for comparing. */
export interface IndexedSong {
  songId: string;
  title: string;
  collection: string | null;
  hymnNumber: string | null;
  status: IndexStatus;
  sourceFileId: string | null;
  sourceModifiedTime: string | null;
  sourceMd5: string | null;
  parserVersion: number;
}

/**
 * A song's lyrics source: the MuseScore file of the lyrics type ("Standard"),
 * its lowest version. ONLY that type - never Chords, Capo or an instrument
 * part, which carry the same words - so a song without one has none.
 */
export function lyricsSource(song: Pick<IndexSong, "versions">, lyricsType: string): SongSource | null {
  const wanted = lyricsType.trim().toLowerCase();
  // Versions arrive in order; the first of the type with a MuseScore file is the lowest.
  for (const version of song.versions) {
    if (version.label.trim().toLowerCase() !== wanted) continue;
    const file = version.files.find((candidate) => candidate.format === "musescore");
    if (file) return { driveFileId: file.driveFileId, modifiedTime: file.modifiedTime ?? null, md5: file.md5 ?? null };
  }
  return null;
}

export type SongWork =
  /** Fetch the file and read its lyrics. */
  | "read"
  /** The file is the one already read; only what the index notes about it changed (it moved, its number changed). */
  | "touch"
  /** Record that it has no source. */
  | "no-source"
  /** Nothing to do. */
  | "unchanged";

const sameInstant = (a: string | null, b: string | null) => a !== null && b !== null && Date.parse(a) === Date.parse(b);

/** Whether `source` is, byte for byte, the file `indexed` was read from. */
export function sourceUnchanged(source: SongSource, indexed: IndexedSong): boolean {
  // The checksum settles it either way, wherever the file now sits and whatever its date says.
  if (source.md5 && indexed.sourceMd5) return source.md5 === indexed.sourceMd5;
  return source.driveFileId === indexed.sourceFileId && sameInstant(source.modifiedTime, indexed.sourceModifiedTime);
}

/**
 * What one song needs.
 *
 *   no source              -> noted once, then nothing
 *   never read             -> read
 *   the parser changed     -> read (every song, once)
 *   failed last time       -> read (it may have been fixed)
 *   its title changed      -> read (the title is part of what is embedded)
 *   same bytes as before   -> nothing, or a note of where the file now is
 *   anything else          -> read
 *
 * A file that is read and turns out to say the same as before costs no
 * embedding: embeddings are kept by the hash of their text (store.ts).
 */
export function songWork(
  song: { title: string; collection: string | null; hymnNumber: string | null },
  source: SongSource | null,
  indexed: IndexedSong | undefined,
  parserVersion: number,
  /** False for the later passes of one refresh, so a file that just failed is not fetched again and again. */
  retryFailed = true,
): SongWork {
  const described =
    indexed !== undefined && indexed.title === song.title && indexed.collection === song.collection && indexed.hymnNumber === song.hymnNumber;

  if (!source) return indexed?.status === "no_source" && described ? "unchanged" : "no-source";
  if (!indexed || indexed.status === "no_source") return "read";
  if (indexed.status === "failed") return retryFailed ? "read" : "unchanged";
  if (indexed.parserVersion !== parserVersion || indexed.title !== song.title) return "read";
  if (!sourceUnchanged(source, indexed)) return "read";

  const sameNote =
    source.driveFileId === indexed.sourceFileId &&
    (source.md5 ?? null) === indexed.sourceMd5 &&
    (source.modifiedTime === indexed.sourceModifiedTime || sameInstant(source.modifiedTime, indexed.sourceModifiedTime));
  return described && sameNote ? "unchanged" : "touch";
}

/** What a refresh did, in the terms Admin -> AI reports. */
export interface RefreshReport {
  /** Songs in the Sheet Music Index. */
  songs: number;
  /** Files opened. */
  read: number;
  /** Of those: lyrics indexed for the first time. */
  added: number;
  /** Of those: lyrics indexed again, because the file or the parser changed. */
  updated: number;
  /** Songs with a file that was already up to date, and so not opened. */
  unchanged: number;
  /** How the library stands afterwards: songs with no file to read, with a file that has no lyrics, with a file that could not be read. */
  noSource: number;
  noLyrics: number;
  failed: number;
  /** No longer in the Index. */
  removed: number;
  /** Texts sent to the embedding model. */
  embedded: number;
  /** Songs still to read, when the time ran out: refresh again to carry on. */
  songsRemaining: number;
  /** Texts still to embed. */
  embeddingsRemaining: number;
}

export const EMPTY_REPORT: RefreshReport = {
  songs: 0,
  read: 0,
  added: 0,
  updated: 0,
  unchanged: 0,
  noSource: 0,
  noLyrics: 0,
  failed: 0,
  removed: 0,
  embedded: 0,
  songsRemaining: 0,
  embeddingsRemaining: 0,
};

/**
 * Several passes of one refresh as one report: a refresh works for a limited
 * time and is asked again until nothing remains (LibraryIndexRefresh), and a
 * song read in an earlier pass is "unchanged" to the next - which must not be
 * what the person is told. What was done adds up; how the library stands is
 * the latest pass's word.
 */
export function mergeReports(earlier: RefreshReport, latest: RefreshReport): RefreshReport {
  return {
    songs: latest.songs,
    read: earlier.read + latest.read,
    added: earlier.added + latest.added,
    updated: earlier.updated + latest.updated,
    unchanged: Math.max(0, latest.unchanged - earlier.read),
    noSource: latest.noSource,
    noLyrics: latest.noLyrics,
    failed: latest.failed,
    removed: earlier.removed + latest.removed,
    embedded: earlier.embedded + latest.embedded,
    songsRemaining: latest.songsRemaining,
    embeddingsRemaining: latest.embeddingsRemaining,
  };
}
