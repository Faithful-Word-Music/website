import "server-only";

import { aiConfig } from "@/lib/ai/config";
import { embedAiValues } from "@/lib/ai/service";
import type { Viewer } from "@/lib/auth/session";

import { searchText } from "./lyrics";
import { findPhrase, findWords, nearestSongs, nearestTo, type SectionHit } from "./store";

/**
 * Searching the library index, two ways that must not be confused:
 *
 *   searchLyrics()     LITERAL. The words a person typed, found in the lyrics
 *                      by plain text matching - deterministic, no model, no
 *                      cost. For "which song has this line".
 *   searchByTheme()    BY MEANING. The question is embedded and compared with
 *                      the embeddings of every song and section. For "songs
 *                      about heaven", where no particular word need appear.
 *   similarSongs()     BY MEANING, from one song's own embedding.
 *
 * An exact phrase is never looked for with embeddings, and a theme is never
 * reduced to a keyword. Read-only, and nothing here opens a file.
 */

/** A phrase shorter than this (folded) matches too much to mean anything. */
const PHRASE_MIN_CHARS = 4;
/** How many sections a literal search reads back before they are folded into songs. */
const LITERAL_ROWS = 60;
/** How many songs, and how many sections, a search by meaning compares in the end. */
const NEAREST_ROWS = 60;

export type LyricSearch =
  /** `hits` hold the phrase exactly as typed (case and punctuation aside). */
  | { mode: "phrase"; hits: SectionHit[] }
  /** No song has the phrase; `hits` have every one of its words, in any order. */
  | { mode: "words"; hits: SectionHit[] }
  | { mode: "too-short"; hits: [] };

export async function searchLyrics(viewer: Viewer, phrase: string): Promise<LyricSearch> {
  const folded = searchText(phrase);
  if (folded.length < PHRASE_MIN_CHARS) return { mode: "too-short", hits: [] };

  const exact = await findPhrase(viewer.env, folded, LITERAL_ROWS);
  if (exact.length > 0) return { mode: "phrase", hits: exact };

  const words = [...new Set(folded.split(" "))];
  return { mode: "words", hits: words.length > 1 ? await findWords(viewer.env, words, LITERAL_ROWS) : [] };
}

export type ThemeSearch =
  /** One entry per song, nearest first, each with its nearest section when a section was what matched. */
  | { ok: true; hits: SectionHit[] }
  /** The question could not be embedded (AI unavailable, the budget spent): say so. */
  | { ok: false; reason: "unavailable" };

/**
 * Songs by what they are about. One call to the embedding model, which joins
 * the usage row of the Conductor question that asked (service.ts).
 */
export async function searchByTheme(viewer: Viewer, query: string, signal?: AbortSignal): Promise<ThemeSearch> {
  const embedded = await embedAiValues({ viewer, feature: "assistant", action: "answer", values: [query], abortSignal: signal });
  if (!embedded.ok || !embedded.embeddings[0]) return { ok: false, reason: "unavailable" };

  const { songs, sections } = await nearestTo(viewer.env, embedded.model, embedded.embeddings[0], NEAREST_ROWS);

  // A song is as near as its nearest part: the whole of it, or one section.
  const best = new Map<string, SectionHit>();
  for (const hit of [...songs, ...sections]) {
    const known = best.get(hit.song.songId);
    if (!known) best.set(hit.song.songId, hit);
    else {
      best.set(hit.song.songId, {
        song: known.song,
        section: known.section ?? hit.section,
        score: Math.max(known.score ?? 0, hit.score ?? 0),
      });
    }
  }
  // Sections arrive nearest first, so the one kept for a song is its nearest.
  return { ok: true, hits: [...best.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) };
}

/** Songs whose words are nearest one song's; null when that song has not been embedded yet. */
export async function similarSongs(viewer: Viewer, songId: string): Promise<SectionHit[] | null> {
  return nearestSongs(viewer.env, aiConfig().embeddingModel, songId, NEAREST_ROWS);
}
