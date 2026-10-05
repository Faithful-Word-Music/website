import "server-only";

import { tool } from "ai";
import { z } from "zod";

import type { ConductorStatusKey } from "@/content/conductor";
import type { Viewer } from "@/lib/auth/session";
import { isDateString } from "@/lib/availability/occurrences";
import { SERVICE_TYPES } from "@/lib/service-archive";
import { searchByTheme, searchLyrics, similarSongs } from "@/lib/library-content/search";
import { getSongSections, listLibrarySongs, type LibrarySong } from "@/lib/library-content/store";
import { loadWorkspace } from "@/lib/service-planner/load";
import { serviceAnchor } from "@/lib/site-search";

import { loadConductorData } from "./data";
import {
  checkSongForService,
  findSongs,
  listServices,
  planCheck,
  servicesOn,
  songFacts,
  songsNotSungSince,
  songUsage,
  songUses,
  SONGS_LISTED_MAX,
  UPCOMING_DAYS_MAX,
  upcomingServices,
  yearSummary,
  type ConductorData,
} from "./facts";
import { clampToolResult } from "./limits";
import { findLibrarySong, lyricMatches, NOT_INDEXED, similarMatches, songLyrics, themeMatches, THEME_SONGS_MAX } from "./lyrics";

/**
 * Conductor's tools: the ONLY way it learns anything about Faithful Word
 * Music. Each is one question the site can already answer - a thin, typed
 * door onto facts.ts, which uses the same functions the pages do.
 *
 *   - Read-only. Nothing here can create, change, publish or delete; there
 *     is no query tool, only these questions.
 *   - Inputs are checked (zod) before a tool runs; a bad one is refused and
 *     the model is told, never guessed around.
 *   - Results are small and capped (clampToolResult), so a question cannot
 *     pull the archive into the conversation.
 *   - Permissions are the person's own: drafts and planner checks need
 *     manage_service_plans as well as use_ai (data.ts, check_service_plan).
 *
 * Two families so far:
 *
 *   the records   what was sung, what is planned, statistics, planner checks
 *                 (facts.ts, over the site's own read layer)
 *   the lyrics    what the songs SAY, from the library index
 *                 (lyrics.ts, over src/lib/library-content) - a song's words,
 *                 an exact phrase found by plain text matching, songs by
 *                 theme and songs alike in theme by embeddings. Every lyric
 *                 result carries the song's history too, so the two families
 *                 answer together.
 *
 * A new family is added as another group here with its own status wording;
 * nothing else changes.
 */

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isDateString, "Not a real date.")
  .describe('A date in church time, "YYYY-MM-DD".');
const slot = z.enum(["AM", "PM"]).describe("AM is the morning service, PM the evening service (Wednesday is PM).");
const song = z.string().trim().min(1).max(120).describe("A song's title, part of its title, or its hymnal number.");
const limit = z.number().int().min(1).max(SONGS_LISTED_MAX).optional().describe("How many songs to list.");

/** A period, as fields of a plain object: an intersection or a refined object is not a schema every model accepts. */
const period = { from: date.describe("The first date of the period, \"YYYY-MM-DD\"."), to: date.describe("The last date of the period, \"YYYY-MM-DD\".") };
/** The period the right way round, whichever way it was given. */
const ordered = <T extends { from: string; to: string }>(input: T): T =>
  input.from <= input.to ? input : { ...input, from: input.to, to: input.from };

/** What the browser is told a tool is doing: a key of conductorContent.status, never the tool itself. */
const TOOL_STATUS = {
  find_songs: "songs",
  get_song: "songs",
  count_song_uses: "songs",
  get_services_on_date: "services",
  list_services: "services",
  list_upcoming_services: "plans",
  song_usage: "statistics",
  songs_not_sung_recently: "statistics",
  get_year_summary: "statistics",
  check_song_for_service: "plans",
  check_service_plan: "planner",
  get_song_lyrics: "lyrics",
  find_lyrics: "lyrics",
  search_songs_by_theme: "themes",
  find_similar_songs: "themes",
} as const satisfies Record<string, ConductorStatusKey>;

export type ConductorToolName = keyof typeof TOOL_STATUS;

export function conductorToolStatus(toolName: string): ConductorStatusKey | null {
  return Object.hasOwn(TOOL_STATUS, toolName) ? TOOL_STATUS[toolName as ConductorToolName] : null;
}

/** What a tool says when the site's own data could not be read: the model then says so rather than guessing. */
const UNAVAILABLE = { unavailable: true, note: "This could not be read from the site just now. Say so; do not guess." };

export function conductorTools(viewer: Viewer) {
  // One read of the site's data for the whole question, however many tools it takes.
  let loading: Promise<ConductorData> | null = null;
  const data = () => (loading ??= loadConductorData(viewer));

  /** Runs one read against the loaded data, bounded, and never throws into the model call. */
  const answer = async (name: string, read: (data: ConductorData) => Record<string, unknown>) => {
    try {
      const loaded = await data();
      if (!loaded.historyAvailable && loaded.upcoming.length === 0) return UNAVAILABLE;
      return clampToolResult(read(loaded));
    } catch (error) {
      console.error(`[conductor] ${name} failed:`, error instanceof Error ? error.message : "unknown error");
      return UNAVAILABLE;
    }
  };

  // The library's songs, read once for the question too: small rows, no lyrics.
  let listing: Promise<LibrarySong[]> | null = null;
  const library = () => (listing ??= listLibrarySongs(viewer.env));

  /**
   * Runs one read of the lyrics, bounded, and never throws into the model
   * call. The history is joined when it can be read, and left out when it
   * cannot: a song's words do not depend on it.
   */
  const lyrics = async (name: string, read: (songs: LibrarySong[], loaded: ConductorData) => Promise<Record<string, unknown>>) => {
    try {
      const [songs, loaded] = await Promise.all([library(), data()]);
      if (!songs.some((song) => song.status === "indexed")) return NOT_INDEXED;
      return clampToolResult(await read(songs, loaded));
    } catch (error) {
      console.error(`[conductor] ${name} failed:`, error instanceof Error ? error.message : "unknown error");
      return UNAVAILABLE;
    }
  };

  /** Limits a list by meaning to what the records allow, as the tools take them. */
  const narrowing = {
    limit: z.number().int().min(1).max(THEME_SONGS_MAX).optional().describe("How many songs to list. Ten when left out."),
    notSungForDays: z
      .number()
      .int()
      .min(1)
      .max(3650)
      .optional()
      .describe('Only songs NOT sung here for at least this many days, and not already planned - for "that we have not sung recently". Songs never sung count.'),
    onlySungBefore: z.boolean().optional().describe("Only songs this church has sung at least once - songs the congregation already knows."),
  };

  return {
    get_song_lyrics: tool({
      description:
        "The words of one song, as this church's own sheet music has them: its verses in order and its refrain. Give a verse number, or ask for the refrain, to get only that part. Use this before quoting, summarising or saying anything about what a song says - for every song, however well known.",
      inputSchema: z.object({
        song,
        verse: z.number().int().min(1).max(30).optional().describe("Only this verse."),
        refrain: z.boolean().optional().describe("Only the refrain."),
      }),
      execute: (input) =>
        lyrics("get_song_lyrics", async (songs, loaded) => {
          const found = findLibrarySong(songs, input.song);
          if (!found.found) return found.answer;
          const sections = found.song.song.status === "indexed" ? await getSongSections(viewer.env, found.song.song.songId) : [];
          return songLyrics(found.song, sections, loaded, { verse: input.verse, refrain: input.refrain });
        }),
    }),

    find_lyrics: tool({
      description:
        'Find songs by the WORDS in them: an exact phrase or line someone remembers ("which song says ..."). Plain text matching, not meaning - for a subject or theme use search_songs_by_theme instead.',
      inputSchema: z.object({
        phrase: z.string().trim().min(2).max(200).describe("The words to look for, as they would be sung. A few distinctive words work best."),
      }),
      execute: ({ phrase }) =>
        lyrics("find_lyrics", async (songs, loaded) => lyricMatches(await searchLyrics(viewer, phrase), phrase, songs, loaded)),
    }),

    search_songs_by_theme: tool({
      description:
        'Find songs by what they are ABOUT - a subject, a doctrine, an occasion, a feeling ("the resurrection", "trusting God through trials", "heaven", "missions") - compared by meaning across every song\'s lyrics. Each song comes with when it was last sung here, and the list can be limited to songs not sung recently or songs sung before. Not for exact words: use find_lyrics for those.',
      inputSchema: z.object({
        theme: z.string().trim().min(2).max(300).describe("What the songs should be about, in a few words or a sentence."),
        ...narrowing,
      }),
      execute: (input, { abortSignal }) =>
        lyrics("search_songs_by_theme", async (songs, loaded) => {
          const found = await searchByTheme(viewer, input.theme, abortSignal);
          if (!found.ok) return UNAVAILABLE;
          return themeMatches(found.hits, input.theme, songs, loaded, input);
        }),
    }),

    find_similar_songs: tool({
      description:
        "Songs whose lyrics are closest in theme to one song's - for something else that says what this song says. Each comes with when it was last sung here, and the list can be limited the same way as search_songs_by_theme.",
      inputSchema: z.object({ song, ...narrowing }),
      execute: (input) =>
        lyrics("find_similar_songs", async (songs, loaded) => {
          const found = findLibrarySong(songs, input.song);
          if (!found.found) return found.answer;
          const hits = found.song.song.status === "indexed" ? await similarSongs(viewer, found.song.song.songId) : null;
          return similarMatches(found.song, hits, songs, loaded, input);
        }),
    }),

    find_songs: tool({
      description:
        "Find songs by title, part of a title, or hymnal number. Use it when it is unclear which song is meant, or to check that a song is known at all.",
      inputSchema: z.object({ query: song }),
      execute: ({ query }) => answer("find_songs", (loaded) => findSongs(loaded, query)),
    }),

    get_song: tool({
      description:
        "Everything recorded about one song: when it was last and first sung, how many times, the keys it has been sung in, how often it comes round, which service and place it is usually sung in, songs it is habitually sung with, the whole service it was last sung in, its latest dates, and where it is planned next.",
      inputSchema: z.object({ song }),
      execute: (input) => answer("get_song", (loaded) => songFacts(loaded, input.song)),
    }),

    count_song_uses: tool({
      description: "How many times one song was sung between two dates (this year, last quarter, a given month), with the dates and keys.",
      inputSchema: z.object({ song, ...period }),
      execute: (input) => answer("count_song_uses", (loaded) => songUses(loaded, input.song, ordered(input).from, ordered(input).to)),
    }),

    get_services_on_date: tool({
      description:
        "The songs of the service or services on one date, in order with their keys - past (what was sung) or future (what is planned). Give the slot to ask about only the morning or only the evening.",
      inputSchema: z.object({ date, slot: slot.optional() }),
      execute: (input) => answer("get_services_on_date", (loaded) => servicesOn(loaded, input.date, input.slot)),
    }),

    list_services: tool({
      description:
        "Services between two dates with their songs, optionally only one kind of service or only those containing one song. Keep the range narrow: at most a dozen are returned.",
      inputSchema: z.object({
        ...period,
        type: z.enum(SERVICE_TYPES).optional().describe("Which services: sundayMorning, sundayEvening, wednesday, special, or all."),
        song: song.optional(),
      }),
      execute: (input) => answer("list_services", (loaded) => listServices(loaded, ordered(input))),
    }),

    list_upcoming_services: tool({
      description:
        "What is planned from today forward: each coming service with its songs, or marked as not posted yet. Give a song to list only the coming services that song is planned for.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(UPCOMING_DAYS_MAX).optional().describe("How many days ahead to look. Three weeks when left out."),
        song: song.optional(),
      }),
      execute: (input) => answer("list_upcoming_services", (loaded) => upcomingServices(loaded, input)),
    }),

    song_usage: tool({
      description:
        'The songs used most, or least, between two dates - for "what have we sung a lot lately" or "what was sung most this year".',
      inputSchema: z.object({ ...period, order: z.enum(["most", "least"]).optional(), limit }),
      execute: (input) => answer("song_usage", (loaded) => songUsage(loaded, ordered(input))),
    }),

    songs_not_sung_recently: tool({
      description:
        "Songs that have been sung before but not for a given number of days, and are not planned - the neglected ones, best-loved first.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(3650).describe("Not sung for at least this many days."),
        minTimesSung: z.number().int().min(1).max(100).optional().describe("Only songs sung at least this many times in all. Two when left out."),
        limit,
      }),
      execute: (input) => answer("songs_not_sung_recently", (loaded) => songsNotSungSince(loaded, input)),
    }),

    get_year_summary: tool({
      description: "One year of singing: services, songs sung, different songs, the most used songs and keys.",
      inputSchema: z.object({ year: z.number().int().min(2000).max(2100) }),
      execute: (input) => answer("get_year_summary", (loaded) => yearSummary(loaded, input.year)),
    }),

    check_song_for_service: tool({
      description:
        "Whether a song would be repeated too soon at one service: when it was last sung before that service, how many days apart, and whether it is already planned for another service nearby.",
      inputSchema: z.object({ song, date, slot }),
      execute: (input) =>
        answer("check_song_for_service", (loaded) => checkSongForService(loaded, input.song, input.date, input.slot)),
    }),

    check_service_plan: tool({
      description:
        "What the Service Planner itself notices about one saved service plan: songs repeated too soon, planned nearby, pairs sung together recently, Christmas songs out of season, sheet music gaps, keys that differ, places not filled - and which musicians are expected. Only for someone who manages service plans.",
      inputSchema: z.object({ date, slot }),
      execute: async (input) => {
        // The planner's own reads assume this permission; use_ai alone does not open a draft.
        if (!viewer.can("manage_service_plans")) {
          return { notAllowed: true, note: "This person does not manage service plans, so planner checks are not available to them." };
        }
        try {
          const workspace = await loadWorkspace(viewer, serviceAnchor(input.date, input.slot));
          if (!workspace) return { found: false, note: "No service is held then." };
          return clampToolResult(planCheck(workspace));
        } catch (error) {
          console.error("[conductor] check_service_plan failed:", error instanceof Error ? error.message : "unknown error");
          return UNAVAILABLE;
        }
      },
    }),
  };
}
