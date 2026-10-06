import { z } from "zod";

import { aiContent } from "@/content/ai";
import { servicePlannerContent } from "@/content/service-planner";
import type { AiErrorCode } from "@/lib/ai/errors";
import { anchorSchema, MAX_PLACES, songSchema } from "@/lib/service-planner/forms";
import { planSong, type PlanSlots } from "@/lib/service-planner/model";

/**
 * What the Service Planner's workspace sends to POST /api/service-planner/ai,
 * and what comes back. Pure - shared by the browser, the route and the tests.
 *
 * The browser sends only what the server cannot know: the songs as they stand
 * in the editor (saved or not), which of them are locked, and what the person
 * typed. Everything a plan is chosen from - the catalog, the history, the
 * week, the philosophy, who may ask - is read on the server.
 */

/** The longest instruction a request may carry. */
export const AI_INSTRUCTION_MAX = 600;

export const planAiRequestSchema = z
  .object({
    /** generate: the whole service. replace: a few suggestions for one place. */
    mode: z.enum(["generate", "replace"]),
    /**
     * generate only - how the whole service is planned:
     *
     *   improve  the songs in unlocked places stay unless another would clearly
     *            serve better; changing nothing is a valid answer
     *   fresh    every unlocked place is chosen from scratch around the locked
     *            songs and the inserts; what stood there earns nothing by it
     */
    strategy: z
      .enum(["improve", "fresh"])
      .optional()
      .transform((value) => value ?? "improve"),
    anchor: anchorSchema,
    /** The revision the editor started from; null for a service not stored yet. */
    revision: z.number().int().positive().nullable(),
    // Each song is made here from its title, number and key, as a saved one is: the browser does not say what is an insert.
    slots: z
      .array(songSchema.nullable().transform((song) => (song ? planSong(song) : null)))
      .min(1)
      .max(MAX_PLACES),
    /** Each place, locked or not (locks.ts). */
    locked: z.array(z.boolean()).max(MAX_PLACES),
    instruction: z
      .string()
      .trim()
      .max(AI_INSTRUCTION_MAX)
      .optional()
      .transform((value) => value ?? ""),
    /** replace: the place asked about, from 0. */
    target: z.number().int().min(0).optional(),
  })
  .refine((body) => body.locked.length === body.slots.length)
  .refine((body) => body.mode !== "replace" || (body.target !== undefined && body.target < body.slots.length));

export type PlanAiRequest = z.infer<typeof planAiRequestSchema>;

/** Why a request came to nothing. The editor is never changed by one. */
export type PlanAiProblem =
  | "signed-out"
  | "forbidden"
  | "invalid"
  | "not-found"
  | "locked-service"
  | "cancelled"
  | "conflict"
  /** Every place is locked: nothing was asked of the model. */
  | "nothing-to-change"
  | "target-locked"
  | "no-philosophy"
  | "no-candidates"
  /** The Christmas season, and too few songs known to be Christmas songs. */
  | "christmas-short"
  | "hourly"
  /** The model answered, twice, with a plan that broke a rule. */
  | "unusable"
  | "unavailable"
  /** The AI layer's own failure (src/lib/ai/errors.ts). */
  | "ai";

export interface PlanAiFailure {
  ok: false;
  problem: PlanAiProblem;
  /** With "ai": which failure. */
  code?: AiErrorCode;
}

/** A suggestion for one place, already the site's own record of the song. */
export interface SongSuggestion {
  title: string;
  number: string | null;
  key: string | null;
  /** The model's reason, in a sentence. Shown, never stored. */
  reason: string;
  /** When it was last sung before this service (an instant), or null. */
  lastSung: string | null;
}

export type PlanAiSuccess =
  | {
      ok: true;
      mode: "generate";
      /** The whole service, to put in place of the editor's. Locked places are exactly as they were sent. */
      slots: PlanSlots;
      /** The places whose song is different, from 0. */
      changed: number[];
      /** The model's few sentences on what it did. Shown, never stored. */
      summary: string;
      /** False when the library's lyrics are not indexed, so the plan came from the history alone. */
      lyricsUsed: boolean;
    }
  | { ok: true; mode: "replace"; suggestions: SongSuggestion[]; lyricsUsed: boolean };

export type PlanAiResult = PlanAiSuccess | PlanAiFailure;

/** What the browser receives when it failed: wording safe to show. */
export type PlanAiResponse = PlanAiSuccess | { ok: false; problem: PlanAiProblem; error: string };

const STATUS: Partial<Record<PlanAiProblem, number>> = {
  "signed-out": 401,
  forbidden: 403,
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  "locked-service": 409,
  cancelled: 409,
  "nothing-to-change": 422,
  "target-locked": 422,
  "no-candidates": 422,
  "christmas-short": 422,
  hourly: 429,
  unusable: 502,
};

export function planAiStatus(failure: PlanAiFailure): number {
  if (failure.problem === "ai" && failure.code === "forbidden") return 403;
  if (failure.problem === "ai" && failure.code === "rate-limited") return 429;
  return STATUS[failure.problem] ?? 503;
}

/** The words for a failure, from src/content. */
export function planAiMessage(failure: PlanAiFailure): string {
  const copy = servicePlannerContent;
  const { errors } = copy.ai;
  switch (failure.problem) {
    case "signed-out":
      return errors.signedOut;
    case "forbidden":
      return errors.forbidden;
    case "invalid":
      return errors.invalid;
    case "not-found":
      return copy.errors.notFound;
    case "locked-service":
      return copy.workspace.locked;
    case "cancelled":
      return errors.cancelled;
    case "conflict":
      return copy.workspace.conflict;
    case "nothing-to-change":
      return copy.ai.nothingOpen;
    case "target-locked":
      return errors.targetLocked;
    case "no-philosophy":
      return errors.noPhilosophy;
    case "no-candidates":
      return errors.noCandidates;
    case "christmas-short":
      return errors.christmasShort;
    case "hourly":
      return errors.hourly;
    case "unusable":
      return errors.unusable;
    case "unavailable":
      return errors.unavailable;
    case "ai":
      return aiContent.errors[failure.code ?? "unknown"];
  }
}
