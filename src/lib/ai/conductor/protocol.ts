import { z } from "zod";

import { isConversationId } from "../conversations/model";
import { CONDUCTOR_LIMITS } from "./limits";

/**
 * What the browser sends POST /api/conductor: the question, which saved
 * conversation it belongs to (none yet for the first question of a new one),
 * and the page Conductor was opened over. Checked here before anything is
 * done with it. Pure - unit tested.
 *
 * The conversation so far is NOT sent: the server reads it from its own
 * record (src/lib/ai/conversations), for the person asking. An id that is not
 * theirs finds nothing.
 */

/** Where Conductor's questions are sent. */
export const CONDUCTOR_ENDPOINT = "/api/conductor";

const requestSchema = z.object({
  question: z.string().max(40_000),
  conversationId: z.string().refine(isConversationId).nullish(),
  /** Ask the conversation's last question again, in place of the answer it got. */
  retry: z.boolean().optional(),
  // Checked on its own (normalizePageContext): a bad page never fails a question.
  context: z.unknown().optional(),
});

export type ConductorRequestProblem = "invalid" | "empty" | "too-long";

export type ParsedConductorRequest =
  | { ok: true; question: string; conversationId: string | null; retry: boolean; context: unknown }
  | { ok: false; problem: ConductorRequestProblem };

export function parseConductorRequest(body: unknown): ParsedConductorRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, problem: "invalid" };

  const question = parsed.data.question.trim();
  if (question === "") return { ok: false, problem: "empty" };
  if (question.length > CONDUCTOR_LIMITS.questionChars) return { ok: false, problem: "too-long" };
  const conversationId = parsed.data.conversationId ?? null;
  // Only a question already in a conversation can be asked again.
  if (parsed.data.retry && !conversationId) return { ok: false, problem: "invalid" };

  return { ok: true, question, conversationId, retry: parsed.data.retry === true, context: parsed.data.context ?? null };
}
