import type { ZodType } from "zod";

import type { AiErrorCode } from "@/lib/ai/errors";
import type { AiFeature } from "@/lib/ai/features";
import type { MemoryContext } from "@/lib/ai/memory/memory";
import type { Permission } from "@/lib/auth/permissions";

import { buildBrief, newSongsOffered, placesToFill, type LibraryFindings, type PlanBrief, type PlanContext } from "./brief";
import { openPlaces } from "./locks";
import { generatePrompt, generateSchema, plannerInstructions, replacePrompt, replaceSchema, withCorrections } from "./prompt";
import type { PlanAiFailure, PlanAiRequest, PlanAiResult } from "./protocol";
import { applyPlan, applySuggestions } from "./validate";

/**
 * Generate with AI and Suggest with AI, start to finish: one request from the
 * Service Planner's workspace, answered with songs for its editor.
 *
 *   1. BOTH permissions, or nothing: manage_service_plans (it reads drafts and
 *      plans a service) and use_ai. The route checks them first; they are
 *      checked again here, and use_ai once more inside the AI layer.
 *   2. Whatever can be refused from the request alone is refused before
 *      anything is read or asked: a service with every song locked makes no
 *      AI call at all.
 *   3. The server reads the service and everything a song is chosen by. The
 *      browser's word is taken only for what the editor holds.
 *   4. The model is given the philosophy whole, the memories that apply
 *      (shared, and the person's own), the facts and a bounded list of
 *      candidates, and answers with song ids in a fixed shape. It is never
 *      given anything said to Conductor.
 *   5. The answer is held to the rules (validate.ts). One that breaks them is
 *      sent back once with what was wrong; a second failure is the end.
 *
 * NOTHING HERE WRITES. It does not save or publish a service, touch another
 * service, or change the week's insert: it returns songs, and the editor
 * holds them as unsaved changes like any other edit.
 *
 * What it needs from the server (the reads, the model, the usage log) comes
 * in as `deps`, so every rule above is unit tested without any of them
 * (plan.test.ts). run.ts supplies the real ones.
 */

export const PLAN_LIMITS = {
  /** Requests one person may make in an hour, per feature (counted from ai_usage). */
  perHour: 30,
  outputTokens: 2000,
  /** How many times the model is asked: the request, and one correction. */
  attempts: 2,
} as const;

/** Who is asking, as far as this needs to know. */
export interface PlanViewer {
  userId: string;
  can(permission: Permission): boolean;
}

export type AskResult<T> = { ok: true; object: T } | { ok: false; code: AiErrorCode };

/**
 * What a planning request is given beside the service itself, from the shared
 * context layer (src/lib/ai/context). There is deliberately nothing here for
 * a Conductor conversation: what was said to Conductor never reaches a plan.
 */
export interface PlanStandingContext {
  /** The planning philosophy in force, whole; null when it cannot be read. */
  philosophy: string | null;
  /** Shared memory, and the person's own. Context to weigh, below the philosophy. */
  memory: MemoryContext;
}

export interface PlanDeps<V extends PlanViewer> {
  /** The standing context every request plans from: the philosophy in force and the memories that apply. */
  context(viewer: V, feature: Feature, request: PlanAiRequest): Promise<PlanStandingContext>;
  /** The service and what it is planned from, read on the server; null when no service is held then. */
  load(viewer: V, anchor: string): Promise<PlanContext | null>;
  /** What the library adds: lyrics, songs found by meaning, the Nativity's words. Never throws. */
  library(viewer: V, request: PlanAiRequest, context: PlanContext, feature: Feature, signal?: AbortSignal): Promise<LibraryFindings>;
  /** One question to the model, answered in the schema's shape. */
  ask<T>(input: { viewer: V; feature: Feature; instructions: string; prompt: string; schema: ZodType<T>; signal?: AbortSignal }): Promise<AskResult<T>>;
  /** How many requests of this feature the person made in the last hour. */
  recentRequests(viewer: V, feature: Feature["feature"]): Promise<number>;
  /** Runs the work as one logged request. */
  asOneRequest<T>(viewer: V, feature: Feature, work: () => Promise<T>): Promise<T>;
  /** Marks the request in progress as failed, for the usage log. */
  fail(code: AiErrorCode, detail: string): void;
  hymnal: string;
}

export interface Feature {
  feature: Extract<AiFeature, "generate_service_plan" | "replace_song">;
  action: string;
}

const FEATURES: Record<PlanAiRequest["mode"], Feature> = {
  generate: { feature: "generate_service_plan", action: "generate" },
  replace: { feature: "replace_song", action: "suggest" },
};

const no = (problem: PlanAiFailure["problem"], code?: AiErrorCode): PlanAiFailure => ({ ok: false, problem, ...(code ? { code } : {}) });

export async function planWithAi<V extends PlanViewer>(
  viewer: V,
  request: PlanAiRequest,
  deps: PlanDeps<V>,
  signal?: AbortSignal,
): Promise<PlanAiResult> {
  if (!viewer.can("manage_service_plans") || !viewer.can("use_ai")) return no("forbidden");
  const feature = FEATURES[request.mode];

  // Known from the request alone, so nothing is read and nothing is asked.
  if (request.mode === "generate") {
    if (openPlaces(request.slots, request.locked, request.instruction === "").length === 0) return no("nothing-to-change");
  } else {
    const target = request.target ?? -1;
    if (target < 0 || target >= request.slots.length) return no("invalid");
    if (request.slots[target] && request.locked[target]) return no("target-locked");
  }

  try {
    if ((await deps.recentRequests(viewer, feature.feature)) >= PLAN_LIMITS.perHour) return no("hourly");
  } catch (error) {
    // The log being unreadable must not stop planning; the Gateway's budget still stands.
    console.error("[service-planner] Could not count recent AI requests:", error instanceof Error ? error.message : "unknown error");
  }

  const { philosophy, memory } = await deps.context(viewer, feature, request);
  if (!philosophy) return no("no-philosophy");

  let context: PlanContext | null;
  try {
    context = await deps.load(viewer, request.anchor);
  } catch (error) {
    console.error("[service-planner] Could not load a service for AI:", error instanceof Error ? error.message : "unknown error");
    return no("unavailable");
  }
  if (!context) return no("not-found");
  if (context.cancelled) return no("cancelled");
  if (context.frozen) return no("locked-service");
  // Someone else saved it since the editor was opened: its songs may no longer be what is being planned around.
  if (context.revision !== request.revision) return no("conflict");
  const loaded = context;

  return deps.asOneRequest(viewer, feature, async () => {
    const library = await deps.library(viewer, request, loaded, feature, signal);
    const brief = buildBrief(request, loaded, library, deps.hymnal);

    const needed = request.mode === "generate" ? placesToFill(brief) : 1;
    if (newSongsOffered(brief) < needed) return no(brief.christmasOnly ? "christmas-short" : "no-candidates");

    const instructions = plannerInstructions(philosophy);
    return request.mode === "generate"
      ? generate(viewer, brief, library, { deps, feature, instructions, memory, signal })
      : suggest(viewer, brief, library, { deps, feature, instructions, memory, signal });
  });
}

interface Asking<V extends PlanViewer> {
  deps: PlanDeps<V>;
  feature: Feature;
  instructions: string;
  memory: MemoryContext;
  signal?: AbortSignal;
}

/**
 * Asks, checks the answer, and asks once more with what was wrong. Returns the
 * first answer that passes, or the failure: the AI layer's own, or "unusable".
 */
async function askUntilUsable<V extends PlanViewer, T, R>(
  viewer: V,
  asking: Asking<V>,
  prompt: string,
  schema: ZodType<T>,
  check: (answer: T) => { ok: true; value: R } | { ok: false; problems: string[] },
): Promise<{ ok: true; value: R; answer: T } | PlanAiFailure> {
  const { deps, feature, instructions, signal } = asking;
  let problems: string[] = [];

  for (let attempt = 0; attempt < PLAN_LIMITS.attempts; attempt += 1) {
    const asked = await deps.ask({
      viewer,
      feature,
      instructions,
      prompt: problems.length > 0 ? withCorrections(prompt, problems) : prompt,
      schema,
      signal,
    });
    if (!asked.ok) {
      // An answer that was not in the shape asked for is an unusable answer like any other: worth one more try.
      if (asked.code === "invalid-response") {
        problems = ["It was not in the form asked for, or named a song that is not a candidate."];
        continue;
      }
      // AI itself is unavailable (the budget, the key, a timeout): asking again would not help.
      deps.fail(asked.code, `The model could not be asked (${asked.code}).`);
      return no("ai", asked.code);
    }
    const checked = check(asked.object);
    if (checked.ok) return { ok: true, value: checked.value, answer: asked.object };
    problems = checked.problems;
  }

  // Counts only: the answer itself is never logged.
  deps.fail("invalid-response", `The plan broke ${problems.length} rule${problems.length === 1 ? "" : "s"} after ${PLAN_LIMITS.attempts} attempts.`);
  return no("unusable");
}

/** Longest summary shown above the songs. */
const SUMMARY_CHARS = 500;

async function generate<V extends PlanViewer>(viewer: V, brief: PlanBrief, library: LibraryFindings, asking: Asking<V>): Promise<PlanAiResult> {
  const result = await askUntilUsable(viewer, asking, generatePrompt(brief, asking.memory),generateSchema([...brief.offered]), (answer) => {
    const applied = applyPlan(brief, answer);
    return applied.ok ? { ok: true, value: applied } : applied;
  });
  if (!result.ok) return result;

  const summary = result.answer.summary.replace(/\s+/g, " ").trim();
  return {
    ok: true,
    mode: "generate",
    slots: result.value.slots,
    changed: result.value.changed,
    summary: summary.length > SUMMARY_CHARS ? `${summary.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : summary,
    lyricsUsed: library.lyricsIndexed,
  };
}

async function suggest<V extends PlanViewer>(viewer: V, brief: PlanBrief, library: LibraryFindings, asking: Asking<V>): Promise<PlanAiResult> {
  const result = await askUntilUsable(viewer, asking, replacePrompt(brief, asking.memory),replaceSchema([...brief.offered]), (answer) => {
    const applied = applySuggestions(brief, answer);
    return applied.ok ? { ok: true, value: applied.suggestions } : applied;
  });
  if (!result.ok) return result;
  return { ok: true, mode: "replace", suggestions: result.value, lyricsUsed: library.lyricsIndexed };
}
