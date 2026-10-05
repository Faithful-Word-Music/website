import "server-only";

import { tool } from "ai";
import { z } from "zod";

import type { ConductorStatusKey } from "@/content/conductor";
import type { Viewer } from "@/lib/auth/session";
import { isDateString } from "@/lib/availability/occurrences";
import { SERVICE_TYPES } from "@/lib/service-archive";
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
 * A new family of tools (searching lyrics, say) is added as another group
 * here with its own status wording; nothing else changes.
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

  return {
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
