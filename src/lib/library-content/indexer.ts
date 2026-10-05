import "server-only";

import { siteConfig } from "@/config/site";
import { aiConfig } from "@/lib/ai/config";
import { embedAiValues, withAiOperation } from "@/lib/ai/service";
import type { Viewer } from "@/lib/auth/session";
import type { IndexSong } from "@/lib/sheet-music";
import { getSheetMusicIndex, readDriveFile } from "@/lib/sheet-music-index";
import { songKey } from "@/lib/song-list";

import { PARSER_VERSION, searchText, sectionEmbeddingText, sha256, songContent, songEmbeddingText } from "./lyrics";
import { extractLyrics, MAX_MSCZ_BYTES, readMscz } from "./musescore";
import { EMPTY_REPORT, lyricsSource, songWork, type RefreshReport, type SongSource, type SongWork } from "./plan";
import {
  countUnembedded,
  getLibraryIndexCounts,
  LibraryIndexUnavailableError,
  listIndexedSongs,
  listLibrarySongs,
  listUnembedded,
  markRefreshed,
  pruneEmbeddings,
  removeSongs,
  saveEmbeddings,
  saveSongs,
  touchSongs,
  type LibraryIndexCounts,
  type SongRecord,
} from "./store";

/**
 * Refreshing the library index: the songs of the Sheet Music Index, their
 * Standard MuseScore files in Drive, read into Neon and embedded.
 *
 *   Sheet Music Index + Drive listing   (the site's own, cached: sheet-music-index.ts)
 *        │  plan.ts: what does each song need?   <- no file opened yet
 *        ▼
 *   only the files that changed are fetched, a few at a time
 *        │  musescore.ts + lyrics.ts: lyrics, in their sections
 *        ▼
 *   library_songs / library_song_sections        (store.ts)
 *        ▼
 *   texts with no embedding from the current model -> the embedding model,
 *   in batches, as ONE library_indexing request in the usage log
 *
 * Started by hand from Admin -> AI; nothing schedules it. A refresh works for
 * a limited time and says what is left, and the page asks again until
 * nothing is - so the first run, which reads every file, never depends on
 * one long request. Run again with nothing changed it opens no file and
 * embeds nothing.
 */

/** How long one pass works before handing back. */
const PASS_MS = 40_000;
/** Files fetched and read at once. */
const FILES_AT_ONCE = 12;
/** Texts in one embedding request, and how many requests run side by side. */
const EMBEDDING_BATCH = 96;
const BATCHES_AT_ONCE = 4;

export type LibraryRefreshFailure =
  /** The Google service account is not set up. */
  | "not-configured"
  /** The Sheet Music Index or Drive could not be read. */
  | "unavailable"
  /** No sheet music type is named as siteConfig.sheetMusic.lyricsType says. */
  | "no-lyrics-type"
  /** The database is not connected, or pgvector could not be enabled. */
  | "database";

export type LibraryRefreshResult =
  | {
      ok: true;
      report: RefreshReport;
      /** Why embedding stopped, in words safe to show; null when it did not. */
      embeddingMessage: string | null;
    }
  | { ok: false; reason: LibraryRefreshFailure };

const describe = (song: IndexSong) => ({
  songId: song.id,
  title: song.title,
  titleKey: songKey(song.title),
  collection: song.collection,
  hymnNumber: song.hymnNumber,
});

/** What to say of a file that could not be read: its kind of failure, never where the file is. */
const failureDetail = (error: unknown) => (error instanceof Error ? error.message : "The file could not be read.").slice(0, 200);

/** Fetches one song's file and reads its lyrics. Never throws: a failure is a record of its own. */
async function readSong(song: IndexSong, source: SongSource): Promise<SongRecord> {
  const base = { ...describe(song), source, parserVersion: PARSER_VERSION, errorDetail: null, content: null };
  try {
    const bytes = await readDriveFile(source.driveFileId, MAX_MSCZ_BYTES);
    const content = songContent(extractLyrics(readMscz(bytes)));
    if (!content) return { ...base, status: "no_lyrics" };
    return {
      ...base,
      status: "indexed",
      content: {
        hash: content.hash,
        text: content.text,
        searchText: content.searchText,
        words: content.words,
        embedHash: sha256(songEmbeddingText(content.sections)),
        sections: content.sections.map((section) => ({
          ...section,
          searchText: searchText(section.text),
          embedHash: sha256(sectionEmbeddingText(song.title, section)),
        })),
      },
    };
  } catch (error) {
    return { ...base, status: "failed", errorDetail: failureDetail(error) };
  }
}

/** Each song of the Index with what a refresh would have to do for it. No file is opened. */
async function planRefresh(viewer: Viewer, retryFailed: boolean) {
  const index = await getSheetMusicIndex();
  if (!index.ok) return index;

  const { lyricsType } = siteConfig.sheetMusic;
  if (!index.index.types.some((type) => type.label.trim().toLowerCase() === lyricsType.toLowerCase())) {
    return { ok: false as const, reason: "no-lyrics-type" as const };
  }

  const indexed = new Map((await listIndexedSongs(viewer.env)).map((song) => [song.songId, song]));
  const songs = index.index.songs.map((song) => {
    const source = lyricsSource(song, lyricsType);
    const known = indexed.get(song.id);
    return { song, source, known, work: songWork(song, source, known, PARSER_VERSION, retryFailed) satisfies SongWork };
  });
  const current = new Set(index.index.songs.map((song) => song.id));
  return { ok: true as const, songs, removed: [...indexed.keys()].filter((songId) => !current.has(songId)) };
}

/**
 * One pass of a refresh (see the notes at the top). `continuing` marks every
 * pass after the first of one refresh. The caller has checked use_ai.
 * Never throws.
 */
export async function refreshLibraryIndex(viewer: Viewer, options: { continuing?: boolean } = {}): Promise<LibraryRefreshResult> {
  const deadline = Date.now() + PASS_MS;
  try {
    const plan = await planRefresh(viewer, !options.continuing);
    if (!plan.ok) return plan;
    const { env } = viewer;

    // What costs nothing first: songs with no file, files that only moved, songs that are gone.
    await saveSongs(
      env,
      plan.songs
        .filter((entry) => entry.work === "no-source")
        .map(({ song }) => ({ ...describe(song), status: "no_source" as const, errorDetail: null, source: null, parserVersion: PARSER_VERSION, content: null })),
    );
    await touchSongs(
      env,
      plan.songs.flatMap(({ song, source, work }) =>
        work === "touch" && source ? [{ songId: song.id, collection: song.collection, hymnNumber: song.hymnNumber, source }] : [],
      ),
    );
    await removeSongs(env, plan.removed);

    // Then the files that have to be opened, a few at a time, saved as they are read.
    const toRead = plan.songs.filter((entry) => entry.work === "read");
    const report: RefreshReport = { ...EMPTY_REPORT, songs: plan.songs.length, removed: plan.removed.length };
    report.unchanged = plan.songs.filter((entry) => entry.source && entry.work !== "read").length;

    let at = 0;
    for (; at < toRead.length && Date.now() < deadline; at += FILES_AT_ONCE) {
      const batch = toRead.slice(at, at + FILES_AT_ONCE);
      const records = await Promise.all(batch.map((entry) => readSong(entry.song, entry.source!)));
      await saveSongs(env, records);
      records.forEach((record, index) => {
        report.read += 1;
        if (record.status !== "indexed") return;
        const before = batch[index].known?.status;
        if (before === "indexed" || before === "no_lyrics") report.updated += 1;
        else report.added += 1;
      });
    }
    report.songsRemaining = Math.max(0, toRead.length - at);

    // Then whatever has no embedding from the current model - whichever pass read it.
    const config = aiConfig();
    const model = config.embeddingModel;
    let embeddingMessage: string | null = null;
    if (config.configured) {
      await withAiOperation({ viewer, feature: "library_indexing", action: "index" }, async () => {
        while (Date.now() < deadline && embeddingMessage === null) {
          const waiting = await listUnembedded(env, model, EMBEDDING_BATCH * BATCHES_AT_ONCE);
          if (waiting.length === 0) break;
          const batches = Array.from({ length: Math.ceil(waiting.length / EMBEDDING_BATCH) }, (_, index) =>
            waiting.slice(index * EMBEDDING_BATCH, (index + 1) * EMBEDDING_BATCH),
          );
          await Promise.all(
            batches.map(async (batch) => {
              const result = await embedAiValues({
                viewer,
                feature: "library_indexing",
                action: "index",
                values: batch.map((text) => (text.whole ? songEmbeddingText(text.sections) : sectionEmbeddingText(text.title, text.sections[0]))),
              });
              if (!result.ok) {
                embeddingMessage ??= result.message;
                return;
              }
              await saveEmbeddings(env, model, batch.map((text, index) => ({ hash: text.hash, vector: result.embeddings[index] })));
              report.embedded += batch.length;
            }),
          );
        }
      });
    }
    report.embeddingsRemaining = await countUnembedded(env, model);

    if (report.songsRemaining === 0) {
      if (report.embeddingsRemaining === 0) await pruneEmbeddings(env, model);
      await markRefreshed(env);
    }

    const counts = await getLibraryIndexCounts(env, model);
    report.noSource = counts.noSource;
    report.noLyrics = counts.noLyrics;
    report.failed = counts.failed;
    return { ok: true, report, embeddingMessage };
  } catch (error) {
    if (error instanceof LibraryIndexUnavailableError) return { ok: false, reason: "database" };
    console.error("[library] Could not refresh the index:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, reason: "database" };
  }
}

export type LibraryIndexStatus =
  | {
      ok: true;
      counts: LibraryIndexCounts;
      /** Songs a refresh would read now: new, changed, or failed last time. Null when the Index could not be read. */
      outOfDate: number | null;
      embeddingModel: string;
      /** Songs it could not read, or has no file for. */
      problems: Array<{ title: string; collection: string | null; hymnNumber: string | null; status: "failed" | "no_lyrics"; detail: string | null }>;
    }
  | { ok: false };

/** How the index stands, for Admin -> AI. Opens no file and asks nothing of the AI Gateway. Never throws. */
export async function getLibraryIndexStatus(viewer: Viewer): Promise<LibraryIndexStatus> {
  try {
    const embeddingModel = aiConfig().embeddingModel;
    const [counts, songs, plan] = await Promise.all([
      getLibraryIndexCounts(viewer.env, embeddingModel),
      listLibrarySongs(viewer.env),
      planRefresh(viewer, true).catch(() => null),
    ]);
    return {
      ok: true,
      counts,
      outOfDate: plan?.ok ? plan.songs.filter((entry) => entry.work === "read").length + plan.removed.length : null,
      embeddingModel,
      problems: songs.flatMap((song) =>
        song.status === "failed" || song.status === "no_lyrics"
          ? [{ title: song.title, collection: song.collection, hymnNumber: song.hymnNumber, status: song.status, detail: song.errorDetail }]
          : [],
      ),
    };
  } catch (error) {
    console.error("[library] Could not read the index's status:", error instanceof Error ? error.message : "unknown error");
    return { ok: false };
  }
}
