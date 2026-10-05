import { siteConfig } from "@/config/site";
import { foldCopies, isSameSong, preferredCopy, resolveLibrarySong, type DirectorySong, type FoldedSong } from "@/lib/library-content/directory";
import { sectionLabel, type LyricSection } from "@/lib/library-content/lyrics";
import { songKey } from "@/lib/song-list";

import { serviceName, songDirectory, type ConductorData } from "./facts";

/**
 * What Conductor's lyric tools hand the model: the words of the library's
 * songs as the index holds them (src/lib/library-content), tied to the same
 * history its other tools read - so "songs about heaven we have not sung
 * lately" is one answer, from one place.
 *
 * Pure functions of what was already read (the index's rows, ConductorData),
 * like facts.ts, and bounded the same way: lists are capped and say so, and a
 * long section is cut short with a mark. Nothing here could write.
 */

const DAY_MS = 86_400_000;

/** A song of the library, with its words' state. */
export interface LibraryEntry extends DirectorySong {
  /** Why its file could not be read, when it could not. */
  errorDetail?: string | null;
}

/** A search's hit: a song, the section that matched (when one did) and how near it was. */
export interface LibraryHit {
  song: LibraryEntry;
  section: LyricSection | null;
  score: number | null;
}

const hymnal = () => siteConfig.sheetMusic.hymnalCollection;

/** Longest section handed back by a search; a whole song's lyrics are not cut. */
export const SECTION_CHARS = 600;
export const LYRIC_MATCHES = 12;
export const THEME_SONGS = 10;
export const THEME_SONGS_MAX = 20;

const clip = (text: string, max = SECTION_CHARS) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** How a song is named to the model: its title, and its number when it is in the church's hymnal. */
function nameSong({ song, alsoIn }: FoldedSong<LibraryEntry>) {
  return {
    title: song.title,
    ...(song.collection === hymnal() && song.hymnNumber ? { number: song.hymnNumber } : {}),
    collection: song.collection,
    ...(song.collection !== hymnal() && song.hymnNumber ? { numberInThatBook: song.hymnNumber } : {}),
    ...(alsoIn.length > 0 ? { alsoIn } : {}),
  };
}

/**
 * What the records say of a library song: how often it has been sung here,
 * when last, and where it is planned. Built once per tool call. A song never
 * sung is said to be so - most of the hymnal has not been.
 */
export interface SongHistory {
  timesSung: number;
  lastSung: string | null;
  daysSinceLastSung: number | null;
  plannedFor?: Array<{ date: string; service: string; status: string }>;
}

export function historyLookup(data: ConductorData) {
  const listed = songDirectory(data);
  const byKey = new Map(listed.map((song) => [song.id, song]));

  return (song: LibraryEntry): SongHistory | null => {
    if (!data.historyAvailable) return null;
    const known = byKey.get(song.titleKey) ?? listed.find((candidate) => isSameSong(song, candidate, hymnal()));
    const planned = known
      ? data.upcoming.filter((service) => service.songs.some((item) => songKey(item.title) === known.id))
      : [];
    const lastSung = known?.lastSung ?? null;
    return {
      timesSung: known?.timesSung ?? 0,
      lastSung,
      daysSinceLastSung: lastSung ? Math.floor((data.now - Date.parse(`${lastSung}T12:00:00Z`)) / DAY_MS) : null,
      ...(planned.length > 0
        ? { plannedFor: planned.slice(0, 3).map((service) => ({ date: service.date, service: serviceName(service), status: service.status })) }
        : {}),
    };
  };
}

const describeSection = (section: LyricSection, max?: number) => ({
  ...(sectionLabel(section) ? { section: sectionLabel(section) } : {}),
  text: max === undefined ? section.text : clip(section.text, max),
});

/** What every lyric result says about where it came from. */
const SOURCE = "The library index: lyrics read from this church's own MuseScore files.";

/** What a tool answers before the index has ever been built. */
export const NOT_INDEXED = {
  lyricsIndexed: false as const,
  note: "The song library's lyrics have not been indexed on this site yet (Admin → AI → Refresh library index). Say so; do not give lyrics from memory.",
};

function unresolved(candidates: Array<FoldedSong<LibraryEntry>>, query: string) {
  return candidates.length === 0
    ? { found: false as const, note: `No song matching "${query}" is in the song library. Do not give its lyrics from memory.` }
    : {
        found: false as const,
        note: "More than one song matches. Ask which one is meant, or use one of these exact titles.",
        possibleSongs: candidates.map(nameSong),
      };
}

const WHY_NO_LYRICS: Record<Exclude<DirectorySong["status"], "indexed">, string> = {
  no_source: "This song has no Standard MuseScore file in the library, so its lyrics are not indexed.",
  no_lyrics: "This song's MuseScore file has no lyrics written in it.",
  failed: "This song's MuseScore file could not be read.",
};

// ---------------------------------------------------------------------------
// One song's lyrics
// ---------------------------------------------------------------------------

export type LyricsRequest =
  | { found: true; song: FoldedSong<LibraryEntry> }
  | { found: false; answer: ReturnType<typeof unresolved> };

/** The library song a tool was asked about, or what to say when it cannot be told. */
export function findLibrarySong(library: readonly LibraryEntry[], query: string): LyricsRequest {
  const { match, candidates } = resolveLibrarySong(library, query, hymnal());
  return match ? { found: true, song: match } : { found: false, answer: unresolved(candidates, query) };
}

/** Which part of a song was asked for: a verse by number, the refrain, or all of it. */
export interface SectionWanted {
  verse?: number;
  refrain?: boolean;
}

export function songLyrics(song: FoldedSong<LibraryEntry>, sections: readonly LyricSection[], data: ConductorData, wanted: SectionWanted = {}) {
  const named = { found: true as const, song: nameSong(song), ...historyLookup(data)(song.song) };
  if (song.song.status !== "indexed" || sections.length === 0) {
    const status = song.song.status === "indexed" ? "no_lyrics" : song.song.status;
    return { ...named, lyricsIndexed: false as const, note: `${WHY_NO_LYRICS[status]} Say that its lyrics are not available; do not give them from memory.` };
  }

  const verses = sections.filter((section) => section.kind === "verse");
  const structure = {
    verses: verses.length,
    hasRefrain: sections.some((section) => section.kind === "refrain"),
  };
  const all = sections.map((section) => describeSection(section));

  if (wanted.verse !== undefined || wanted.refrain) {
    const chosen = sections.filter(
      (section) => (wanted.verse !== undefined && section.kind === "verse" && section.number === wanted.verse) || (wanted.refrain === true && section.kind === "refrain"),
    );
    if (chosen.length === 0) {
      return {
        ...named,
        lyricsIndexed: true as const,
        ...structure,
        note:
          wanted.verse !== undefined && verses.length === 0
            ? "This song's lyrics are not divided into numbered verses in its file. Its sections are given in order."
            : "The song has no such section. Its sections are given in order.",
        lyrics: all,
        source: SOURCE,
      };
    }
    return { ...named, lyricsIndexed: true as const, ...structure, lyrics: chosen.map((section) => describeSection(section)), source: SOURCE };
  }

  return { ...named, lyricsIndexed: true as const, ...structure, lyrics: all, source: SOURCE };
}

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

/** Hits folded so each song appears once, as the copy the church sings from, in the order given. */
function foldHits(hits: readonly LibraryHit[], library: readonly LibraryEntry[]) {
  const copies = new Map<string, LibraryEntry[]>();
  for (const song of library) copies.set(song.titleKey, [...(copies.get(song.titleKey) ?? []), song]);

  const seen = new Set<string>();
  const folded: Array<{ song: FoldedSong<LibraryEntry>; hit: LibraryHit }> = [];
  for (const hit of hits) {
    if (seen.has(hit.song.titleKey)) continue;
    seen.add(hit.song.titleKey);
    const [song] = foldCopies(copies.get(hit.song.titleKey) ?? [hit.song], hymnal());
    folded.push({ song: song ?? { song: preferredCopy([hit.song], hymnal()), alsoIn: [] }, hit });
  }
  return folded;
}

/** What a literal search found: songs holding the words that were typed. */
export function lyricMatches(
  search: { mode: "phrase" | "words" | "too-short"; hits: readonly LibraryHit[] },
  phrase: string,
  library: readonly LibraryEntry[],
  data: ConductorData,
) {
  if (search.mode === "too-short") {
    return { phrase, songsMatching: 0, note: "That is too short to search for. Ask for more of the words." };
  }
  const history = historyLookup(data);
  const songs = foldHits(search.hits, library);
  const shown = songs.slice(0, LYRIC_MATCHES);

  return {
    phrase,
    matched: search.mode === "phrase" ? "the exact phrase" : "every word, in any order (no song has the exact phrase)",
    songsMatching: songs.length,
    songs: shown.map(({ song, hit }) => ({
      ...nameSong(song),
      ...(hit.section ? { foundIn: describeSection(hit.section, SECTION_CHARS) } : { foundIn: { note: "The phrase runs from one section into the next." } }),
      ...history(song.song),
    })),
    ...(songs.length > shown.length ? { truncated: true } : {}),
    ...(songs.length === 0
      ? { note: "No indexed song has these words. Lyrics keep their poetic spellings (\"ev'ry\", \"heav'n\", \"o'er\"); try fewer words, or search by theme instead." }
      : {}),
    source: SOURCE,
  };
}

export interface ThemeOptions {
  limit?: number;
  /** Only songs not sung here for at least this many days (songs never sung count). */
  notSungForDays?: number;
  /** Only songs this church has sung at least once. */
  onlySungBefore?: boolean;
}

/** A relevance the model can compare but not mistake for a measurement. */
const closeness = (score: number | null) => (score === null ? null : Math.round(score * 100) / 100);

/** How many songs a list by meaning hands back. */
const listSize = (limit: number | undefined) => Math.min(Math.max(1, Math.round(limit ?? THEME_SONGS)), THEME_SONGS_MAX);

/** Songs by meaning, nearest first, narrowed by the history when asked. */
function nearestSongs(hits: readonly LibraryHit[], library: readonly LibraryEntry[], data: ConductorData, options: ThemeOptions) {
  const history = historyLookup(data);
  const cutoffDays = options.notSungForDays === undefined ? null : Math.max(1, Math.round(options.notSungForDays));

  const songs = foldHits(hits, library)
    .map(({ song, hit }) => ({ song, hit, sung: history(song.song) }))
    .filter(({ sung }) => {
      if (!sung) return true;
      if (options.onlySungBefore && sung.timesSung === 0) return false;
      if (cutoffDays !== null) {
        if (sung.plannedFor) return false;
        if (sung.daysSinceLastSung !== null && sung.daysSinceLastSung < cutoffDays) return false;
      }
      return true;
    });
  const limit = listSize(options.limit);

  return {
    songs: songs.slice(0, limit).map(({ song, hit, sung }) => ({
      ...nameSong(song),
      closeness: closeness(hit.score),
      ...(hit.section ? { closestSection: describeSection(hit.section, SECTION_CHARS) } : {}),
      ...sung,
    })),
    ...(songs.length > limit ? { truncated: true } : {}),
    ...(cutoffDays !== null ? { onlySongsNotSungForDays: cutoffDays, plannedSongsLeftOut: true } : {}),
    ...(options.onlySungBefore ? { onlySongsSungHereBefore: true } : {}),
    ...(data.historyAvailable ? { recordsBegin: data.past[0]?.date ?? null } : { note: "The song history could not be read, so nothing is known of when these were sung." }),
  };
}

export function themeMatches(hits: readonly LibraryHit[], theme: string, library: readonly LibraryEntry[], data: ConductorData, options: ThemeOptions = {}) {
  const found = nearestSongs(hits, library, data, options);
  return {
    theme,
    ...found,
    howToRead:
      "Ranked by closeness of meaning, nearest first - a ranking, not a verdict. Judge each song from the words returned here (get_song_lyrics shows all of them) before saying it is about the theme, and leave out any that are not.",
    ...(found.songs.length === 0 ? { note: "No indexed song fits within these limits." } : {}),
    source: SOURCE,
  };
}

export function similarMatches(song: FoldedSong<LibraryEntry>, hits: readonly LibraryHit[] | null, library: readonly LibraryEntry[], data: ConductorData, options: ThemeOptions = {}) {
  const named = { found: true as const, song: nameSong(song) };
  if (song.song.status !== "indexed") {
    return { ...named, lyricsIndexed: false as const, note: `${WHY_NO_LYRICS[song.song.status]} Nothing can be compared with it.` };
  }
  if (hits === null) {
    return { ...named, note: "This song's lyrics are indexed but have not been embedded yet, so it cannot be compared (Admin → AI → Refresh library index)." };
  }
  // Another printing of the same song is not a similar song.
  const others = hits.filter((hit) => hit.song.titleKey !== song.song.titleKey);
  return {
    ...named,
    ...nearestSongs(others, library, data, options),
    howToRead: "Ranked by how close the whole of each song's words is to this one's, nearest first. It compares what the songs say, not their tunes.",
    source: SOURCE,
  };
}
