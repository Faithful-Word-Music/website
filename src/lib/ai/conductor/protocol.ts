import { z } from "zod";

import { CONDUCTOR_LIMITS, type ConductorTurn } from "./limits";

/**
 * What the browser sends POST /api/conductor: the conversation so far, ending
 * with the question, and the page Conductor was opened over. Checked here
 * before anything is done with it. Pure - unit tested.
 */

/** Where Conductor's questions are sent. */
export const CONDUCTOR_ENDPOINT = "/api/conductor";

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(40_000) }))
    .min(1)
    .max(CONDUCTOR_LIMITS.storedTurns + 2),
  // Checked on its own (normalizePageContext): a bad page never fails a question.
  context: z.unknown().optional(),
});

export type ConductorRequestProblem = "invalid" | "empty" | "too-long";

export type ParsedConductorRequest =
  | { ok: true; turns: ConductorTurn[]; context: unknown }
  | { ok: false; problem: ConductorRequestProblem };

export function parseConductorRequest(body: unknown): ParsedConductorRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, problem: "invalid" };

  const turns = parsed.data.messages;
  const question = turns[turns.length - 1];
  if (question.role !== "user") return { ok: false, problem: "invalid" };
  const text = question.text.trim();
  if (text === "") return { ok: false, problem: "empty" };
  if (text.length > CONDUCTOR_LIMITS.questionChars) return { ok: false, problem: "too-long" };

  return { ok: true, turns, context: parsed.data.context ?? null };
}
