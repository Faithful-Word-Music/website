import "server-only";

import { siteConfig } from "@/config/site";
import type { Viewer } from "@/lib/auth/session";
import { searchByTheme, similarSongs } from "@/lib/library-content/search";
import { listLibrarySongs, listSongOpenings, songsWithAnyWord, type SectionHit } from "@/lib/library-content/store";
import { loadServiceContext } from "@/lib/service-planner/load";
import { isInsert, slotSongs, weekStartOf } from "@/lib/service-planner/model";
import { songKey } from "@/lib/song-list";

import { loadPlanningPhilosophy } from "../planning/load";
import { failAiOperation, generateAiObject, withAiOperation } from "../service";
import { countRecentAiUsage } from "../store";
import { NO_LIBRARY, OPENING_CHARS, serviceWords, type LibraryFindings, type PlanContext, type WeekService } from "./brief";
import { linkLibrary } from "./library";
import { PLAN_LIMITS, planWithAi, type Feature, type PlanDeps } from "./plan";
import type { PlanAiRequest, PlanAiResult } from "./protocol";
import { NATIVITY_WORDS, SEASON_SEARCH, serviceSeason } from "./season";

/**
 * The server's side of Generate with AI: the real reads, the real model and
 * the real usage log behind planWithAi() (plan.ts), which holds the rules.
 * POST /api/service-planner/ai is the only caller.
 *
 * Everything here READS. The planner's own loader gives the service, the
 * catalog and the history - the same facts the workspace shows - and the
 * library index gives the lyrics. Nothing is saved, published or revalidated.
 */

const HOUR_MS = 3_600_000;
const hymnal = siteConfig.sheetMusic.hymnalCollection;

/** Songs taken from each search by meaning. */
const NEAR = { instruction: 14, season: 24, song: 10, songs: 3 } as const;

/** The service being planned and the rest of its week, as the planner's own loader has them. */
async function load(viewer: Viewer, anchor: string): Promise<PlanContext | null> {
  const loaded = await loadServiceContext(viewer, anchor);
  if (!loaded) return null;
  const { service } = loaded;
  const weekStart = weekStartOf(service.date);
  const isThis = (other: { date: string; slot: string }) => other.date === service.date && other.slot === service.slot;
  const inWeek = (other: { date: string; slot: string }) => weekStartOf(other.date) === weekStart && !isThis(other);
  const songsOf = (songs: ReturnType<typeof slotSongs>) =>
    songs.map((song) => ({ title: song.title, ...(isInsert(song) ? { insert: true as const } : {}) }));

  // What is stored is the latest word on a service; the history fills in what the planner does not hold.
  const week = new Map<string, WeekService & { startsAt: string }>();
  for (const sung of loaded.past.filter(inWeek)) {
    week.set(`${sung.date}|${sung.slot}`, { date: sung.date, service: serviceWords(sung), status: "sung", songs: songsOf(sung.songs), startsAt: sung.startsAt });
  }
  for (const plan of loaded.plans.filter((plan) => inWeek(plan) && plan.status !== "cancelled")) {
    const songs = slotSongs(plan.slots);
    // A service with nothing but the week's insert says nothing the insert does not.
    if (!songs.some((song) => !isInsert(song))) continue;
    week.set(`${plan.date}|${plan.slot}`, {
      date: plan.date,
      service: serviceWords(plan),
      status: Date.parse(plan.startsAt) <= loaded.now && plan.status === "published" ? "sung" : plan.status === "published" ? "planned" : "draft",
      songs: songsOf(songs),
      startsAt: plan.startsAt,
    });
  }

  return {
    service: { date: service.date, slot: service.slot, startsAt: service.startsAt, label: service.label, special: service.kind === "special" },
    revision: service.plan?.revision ?? null,
    cancelled: service.status === "cancelled",
    frozen: loaded.locked,
    candidates: loaded.candidates,
    past: loaded.past,
    week: [...week.values()]
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((item) => ({ date: item.date, service: item.service, status: item.status, songs: item.songs })),
  };
}

/**
 * What the library index adds to a request: how each song's lyrics begin,
 * songs found by meaning (near the insert and the locked songs, near what was
 * asked for, near the season's subject), and in the Christmas season which
 * songs' lyrics name the Nativity.
 *
 * It only widens what the model may look at. Without it - no index yet, the
 * database or the Gateway unreachable - a plan is still made from the history,
 * and says so.
 */
async function library(viewer: Viewer, request: PlanAiRequest, context: PlanContext, feature: Feature, signal?: AbortSignal): Promise<LibraryFindings> {
  try {
    const songs = await listLibrarySongs(viewer.env);
    const indexed = songs.filter((song) => song.status === "indexed");
    if (indexed.length === 0) return NO_LIBRARY;

    const links = linkLibrary(context.candidates, indexed, hymnal);
    const season = serviceSeason(context.service.date);
    const toCandidates = (hits: readonly SectionHit[], limit: number) => {
      const ids = hits.flatMap((hit) => links.candidateOf.get(hit.song.songId) ?? []);
      return [...new Set(ids)].slice(0, limit);
    };
    const quietly = async <T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await read();
      } catch (error) {
        console.error(`[service-planner] Could not read ${what}:`, error instanceof Error ? error.message : "unknown error");
        return fallback;
      }
    };

    // The songs a plan is built around: the one asked about and its neighbours, or the insert and the locked songs.
    const around =
      request.mode === "replace"
        ? [request.target ?? 0, (request.target ?? 0) - 1, (request.target ?? 0) + 1]
        : request.slots.flatMap((song, index) => (song && (isInsert(song) || request.locked[index]) ? [index] : []));
    const anchors = around
      .flatMap((index) => {
        const song = request.slots[index];
        return song ? (links.songOf.get(songKey(song.title))?.songId ?? []) : [];
      })
      .slice(0, NEAR.songs);

    const byMeaning = async (words: string, limit: number) => {
      const found = await searchByTheme(viewer, words, signal, feature);
      return found.ok ? toCandidates(found.hits, limit) : [];
    };

    // The Christmas season plans from the whole of its own repertoire, so nothing is searched for.
    const christmas = season === "christmas";
    const [openings, nativity, asked, seasonal, ...similar] = await Promise.all([
      quietly("the lyrics", () => listSongOpenings(viewer.env, [...links.songOf.values()].map((song) => song.songId), OPENING_CHARS), new Map<string, string>()),
      christmas ? quietly("the Nativity's words", () => songsWithAnyWord(viewer.env, NATIVITY_WORDS), []) : [],
      !christmas && request.instruction !== "" ? quietly("songs by the instruction", () => byMeaning(request.instruction, NEAR.instruction), []) : [],
      season && !christmas ? quietly("songs of the season", () => byMeaning(SEASON_SEARCH[season], NEAR.season), []) : [],
      ...(christmas
        ? []
        : anchors.map((songId) => quietly("similar songs", async () => toCandidates((await similarSongs(viewer, songId)) ?? [], NEAR.song), []))),
    ]);

    return {
      lyricsIndexed: true,
      // What the season calls for first, then what was asked for, then what sits near the songs already there.
      thematic: [...new Set([...seasonal, ...asked, ...similar.flat()])],
      openings: new Map([...links.songOf].flatMap(([id, song]) => (openings.has(song.songId) ? [[id, openings.get(song.songId)!] as const] : []))),
      nativity: new Set(nativity.flatMap((songId) => links.candidateOf.get(songId) ?? [])),
    };
  } catch (error) {
    console.error("[service-planner] Could not read the library index:", error instanceof Error ? error.message : "unknown error");
    return NO_LIBRARY;
  }
}

const deps: PlanDeps<Viewer> = {
  hymnal,
  philosophy: async () => {
    const loaded = await loadPlanningPhilosophy();
    return loaded.ok ? loaded.philosophy.markdown : null;
  },
  load,
  library,
  ask: async ({ viewer, feature, instructions, prompt, schema, signal }) => {
    const result = await generateAiObject({
      viewer,
      ...feature,
      instructions,
      prompt,
      schema,
      maxOutputTokens: PLAN_LIMITS.outputTokens,
      reasoning: "low",
      abortSignal: signal,
    });
    return result.ok ? { ok: true, object: result.object } : { ok: false, code: result.code };
  },
  recentRequests: (viewer, feature) => countRecentAiUsage(viewer.env, viewer.userId, feature, new Date(Date.now() - HOUR_MS).toISOString()),
  asOneRequest: (viewer, feature, work) => withAiOperation({ viewer, ...feature }, work),
  fail: failAiOperation,
};

/** One request from the workspace, answered. Never throws for a failure it knows; the route answers for the rest. */
export function answerPlanRequest(viewer: Viewer, request: PlanAiRequest, signal?: AbortSignal): Promise<PlanAiResult> {
  return planWithAi(viewer, request, deps, signal);
}
