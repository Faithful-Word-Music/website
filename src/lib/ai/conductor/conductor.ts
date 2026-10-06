import "server-only";

import { conductorContent } from "@/content/conductor";
import type { Viewer } from "@/lib/auth/session";

import { assembleAiContext } from "../context/assemble";
import { CONVERSATION_LIMITS, conversationContext, titleFromQuestion, type StoredConversation } from "../conversations/model";
import {
  addMessage,
  attachActions,
  conversationsConfigured,
  createConversation,
  deleteConversation,
  getConversation,
  listMessages,
  removeLastExchange,
} from "../conversations/store";
import { refreshConversationSummary } from "../conversations/summary";
import type { AiErrorCode } from "../errors";
import { canManageGlobalMemory, canUsePersonalMemory } from "../memory/service";
import { philosophyOutline } from "../planning/philosophy";
import { streamAiText } from "../service";
import { countRecentAiUsage } from "../store";
import { CONVERSATION_EVENT } from "./actions";
import { normalizePageContext } from "./context";
import { conductorInstructions } from "./instructions";
import { CONDUCTOR_LIMITS } from "./limits";
import { conductorTools, conductorToolStatus, type ConductorTurnState } from "./tools";

const HOUR_MS = 3_600_000;

export type ConductorAnswer =
  | {
      ok: true;
      stream: ReadableStream<Uint8Array>;
      /** Settles once the answer has been stored and the conversation's summary brought up to date. Never rejects. */
      finished: Promise<void>;
    }
  | { ok: false; code: AiErrorCode | "not-found" | "unavailable"; message: string };

/**
 * Conductor answering one question: the site's AI assistant, behind the
 * Conductor page, the desktop panel and the phone sheet alike (POST
 * /api/conductor is the only caller, and has already checked use_ai).
 *
 *   1. One person's questions are capped per hour, counted from ai_usage.
 *   2. The question joins a SAVED conversation of this person's - a new one
 *      when none is named - and is stored before anything is asked. A
 *      conversation that is not theirs is not found.
 *   3. What the model is sent of the conversation is read from the server's
 *      own record, never taken from the browser: the latest turns word for
 *      word and a summary of what came before (conversations/model.ts).
 *   4. Its standing context comes from the shared context layer
 *      (src/lib/ai/context): the philosophy's section titles, and the shared
 *      and personal memories that apply to this person.
 *   5. The request itself is streamAiText(): use_ai checked again, a bounded
 *      number of model calls, one usage row, and never an exception.
 *   6. When the answer ends - finished, stopped or failed - it is stored with
 *      whatever it proposed, before the page is told it is done.
 *
 * The answer's tools only read, or propose (tools.ts). Nothing is saved to
 * memory and nothing about the philosophy changes here.
 */
export async function answerConductor(input: {
  viewer: Viewer;
  question: string;
  conversationId: string | null;
  /** Ask the conversation's last question again, in place of the answer it got. */
  retry: boolean;
  /** As the browser sent it; not trusted. */
  context: unknown;
  signal?: AbortSignal;
}): Promise<ConductorAnswer> {
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

  if (!conversationsConfigured()) return { ok: false, code: "unavailable", message: conductorContent.errors.unavailable };

  let conversation: StoredConversation | null;
  let messages;
  try {
    conversation = input.conversationId
      ? await getConversation(viewer.env, viewer.userId, input.conversationId)
      : await createConversation(viewer.env, viewer.userId, titleFromQuestion(input.question, conductorContent.history.untitled));
    if (!conversation) return { ok: false, code: "not-found", message: conductorContent.errors.notFound };

    if (input.retry) await removeLastExchange(viewer.env, viewer.userId, conversation.id, input.question);
    if ((await addMessage(viewer.env, viewer.userId, conversation.id, { role: "user", text: input.question })) === null) {
      return { ok: false, code: "not-found", message: conductorContent.errors.notFound };
    }
    messages = await listMessages(viewer.env, viewer.userId, conversation.id, {
      afterId: conversation.summaryThrough,
      limit: CONVERSATION_LIMITS.contextMessages,
    });
  } catch (error) {
    console.error("[conductor] Could not read or store the conversation:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, code: "unavailable", message: conductorContent.errors.unavailable };
  }

  const { turns, summary } = conversationContext(conversation, messages);
  if (turns.length === 0) return { ok: false, code: "invalid-response", message: conductorContent.errors.invalid };

  // The philosophy's section titles and the memories that apply: the same layer the planner asks.
  const standing = await assembleAiContext(viewer, "assistant", { query: input.question });

  const conversationId = conversation.id;
  const turn: ConductorTurnState = { conversationId, proposed: [] };
  let settle: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const answer = await streamAiText({
    viewer,
    feature: "assistant",
    action: "answer",
    instructions: conductorInstructions({
      now: Date.now(),
      context: normalizePageContext(input.context),
      canPlan: viewer.can("manage_service_plans"),
      philosophyOutline: standing.philosophy.ok ? philosophyOutline(standing.philosophy.philosophy) : null,
      abilities: {
        personalMemory: canUsePersonalMemory(viewer),
        globalMemory: canManageGlobalMemory(viewer),
        philosophy: viewer.can("manage_planning_philosophy"),
      },
      summary,
      memory: standing.memory,
    }),
    messages: turns.map((item) => ({ role: item.role, content: item.text })),
    tools: conductorTools(viewer, turn),
    maxSteps: CONDUCTOR_LIMITS.steps,
    maxOutputTokens: CONDUCTOR_LIMITS.outputTokens,
    reasoning: "low",
    toolTimeoutMs: CONDUCTOR_LIMITS.toolMs,
    abortSignal: input.signal,
    toolStatus: conductorToolStatus,
    // The page learns which conversation this is before the first word, so a new one is in its list at once.
    preface: [{ name: CONVERSATION_EVENT, value: { id: conversationId, title: conversation.title, createdAt: conversation.createdAt, lastMessageAt: new Date().toISOString() } }],
    onSettled: async (outcome) => {
      try {
        const messageId = await addMessage(viewer.env, viewer.userId, conversationId, {
          role: "assistant",
          text: outcome.text,
          status: outcome.failed ? "error" : outcome.aborted ? "stopped" : "complete",
          // The wording the person was shown is worked out again from the code when the conversation is reopened.
          errorMessage: outcome.failed,
        });
        if (messageId !== null) await attachActions(viewer.env, viewer.userId, turn.proposed.map((action) => action.id), messageId);
      } catch (error) {
        console.error("[conductor] Could not store an answer:", error instanceof Error ? error.message : "unknown error");
      } finally {
        // After the page has its answer: nothing here holds the stream open.
        void refreshConversationSummary(viewer, conversationId).finally(settle);
      }
    },
  });

  if (!answer.ok) {
    settle();
    // Nothing was asked of the model, so the question is not left standing with no answer:
    // a conversation begun for it goes, and an existing one loses only that question.
    try {
      if (input.conversationId) await removeLastExchange(viewer.env, viewer.userId, conversationId, input.question);
      else await deleteConversation(viewer.env, viewer.userId, conversationId);
    } catch (error) {
      console.error("[conductor] Could not take back an unanswered question:", error instanceof Error ? error.message : "unknown error");
    }
    return answer;
  }
  return { ok: true, stream: answer.stream, finished };
}
