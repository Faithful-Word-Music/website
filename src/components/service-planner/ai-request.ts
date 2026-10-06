import { feedbackContent } from "@/content/feedback";
import type { PlanAiProblem, PlanAiRequest, PlanAiResponse, PlanAiSuccess } from "@/lib/ai/service-planner/protocol";

/** What the workspace sends: the request as typed, before the server's defaults. */
export type PlanAiBody = Omit<PlanAiRequest, "instruction" | "strategy"> & {
  instruction?: string;
  strategy?: PlanAiRequest["strategy"];
};

export type PlanAiOutcome<M extends PlanAiSuccess["mode"]> =
  | Extract<PlanAiSuccess, { mode: M }>
  | { ok: false; error: string; problem?: PlanAiProblem; /** The person stopped it: nothing to say. */ stopped?: true };

/**
 * Asks POST /api/service-planner/ai for songs. Never throws: whatever goes
 * wrong comes back as { ok: false } with wording to show, and the editor is
 * left exactly as it was.
 */
export async function requestPlanAi<M extends PlanAiSuccess["mode"]>(body: PlanAiBody & { mode: M }, signal?: AbortSignal): Promise<PlanAiOutcome<M>> {
  try {
    const response = await fetch("/api/service-planner/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const answer = (await response.json().catch(() => null)) as PlanAiResponse | null;
    if (!answer || typeof answer.ok !== "boolean") return { ok: false, error: feedbackContent.failed };
    if (!answer.ok) return { ok: false, error: answer.error, problem: answer.problem };
    if (answer.mode !== body.mode) return { ok: false, error: feedbackContent.failed };
    return answer as Extract<PlanAiSuccess, { mode: M }>;
  } catch {
    if (signal?.aborted) return { ok: false, error: "", stopped: true };
    return { ok: false, error: feedbackContent.failed };
  }
}
