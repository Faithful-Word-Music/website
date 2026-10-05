import "server-only";

import { conductorContent } from "@/content/conductor";
import type { Viewer } from "@/lib/auth/session";

import { loadPlanningPhilosophy } from "../planning/load";
import { philosophyOutline } from "../planning/philosophy";
import { streamAiText, type AiStreamResult } from "../service";
import { countRecentAiUsage } from "../store";
import { normalizePageContext } from "./context";
import { conductorInstructions } from "./instructions";
import { CONDUCTOR_LIMITS, trimConversation, type ConductorTurn } from "./limits";
import { conductorTools, conductorToolStatus } from "./tools";

const HOUR_MS = 3_600_000;

/**
 * Conductor answering one question: the site's AI assistant, behind both the
 * Conductor page and the floating panel (POST /api/conductor is the only
 * caller, and has already checked use_ai).
 *
 *   1. One person's questions are capped per hour, counted from ai_usage.
 *   2. Only the latest part of the conversation goes to the model
 *      (trimConversation), and only its text.
 *   3. The model gets Conductor's instructions, the page it was opened over
 *      (checked first - normalizePageContext), the titles of the planning
 *      philosophy's sections, and the read-only tools.
 *   4. The request itself is streamAiText(): use_ai checked again, a bounded
 *      number of model calls, one usage row, and never an exception.
 *
 * Nothing about the conversation is kept on the server.
 */
export async function answerConductor(input: {
  viewer: Viewer;
  turns: readonly ConductorTurn[];
  /** As the browser sent it; not trusted. */
  context: unknown;
  signal?: AbortSignal;
}): Promise<AiStreamResult> {
  const { viewer } = input;

  if (viewer.can("use_ai")) {
    try {
      const since = new Date(Date.now() - HOUR_MS).toISOString();
      if ((await countRecentAiUsage(viewer.env, viewer.userId, "assistant", since)) >= CONDUCTOR_LIMITS.perHour) {
        return { ok: false, code: "rate-limited", message: conductorContent.errors.hourly };
      }
    } catch (error) {
      // The log being unreadable must not stop Conductor; the Gateway's budget still stands.
      console.error("[conductor] Could not count recent questions:", error instanceof Error ? error.message : "unknown error");
    }
  }

  const messages = trimConversation(input.turns);
  if (messages.length === 0) return { ok: false, code: "invalid-response", message: conductorContent.errors.invalid };

  // A read from disk, kept for the life of the server: only the section titles go into the instructions.
  const planning = await loadPlanningPhilosophy();

  return streamAiText({
    viewer,
    feature: "assistant",
    action: "answer",
    instructions: conductorInstructions({
      now: Date.now(),
      context: normalizePageContext(input.context),
      canPlan: viewer.can("manage_service_plans"),
      philosophyOutline: planning.ok ? philosophyOutline(planning.philosophy) : null,
    }),
    messages: messages.map((turn) => ({ role: turn.role, content: turn.text })),
    tools: conductorTools(viewer),
    maxSteps: CONDUCTOR_LIMITS.steps,
    maxOutputTokens: CONDUCTOR_LIMITS.outputTokens,
    reasoning: "low",
    toolTimeoutMs: CONDUCTOR_LIMITS.toolMs,
    abortSignal: input.signal,
    toolStatus: conductorToolStatus,
  });
}
