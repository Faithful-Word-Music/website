import "server-only";

import type { Viewer } from "@/lib/auth/session";

import { generateAiText } from "../service";
import { CONVERSATION_LIMITS, messagesToSummarize, normalizeSummary, SUMMARY_INSTRUCTIONS, summarySource } from "./model";
import { getConversation, listMessages, setConversationSummary } from "./store";

/**
 * Keeps a long conversation's summary up to date, after an answer has been
 * sent: once enough messages have dropped out of the part the model is sent
 * word for word, they are folded into the conversation's summary, and are not
 * read back again.
 *
 * One small model call, logged as its own feature (conductor_summary) so it
 * does not count against a person's questions. The model here has no tools
 * and no memory, and the only thing written is the conversation's own
 * `summary`: a summary NEVER becomes a memory.
 *
 * Never throws, and nothing waits on it: a conversation without an up-to-date
 * summary simply sends its latest turns, as every conversation did before.
 */
export async function refreshConversationSummary(viewer: Viewer, conversationId: string): Promise<void> {
  try {
    const conversation = await getConversation(viewer.env, viewer.userId, conversationId);
    if (!conversation) return;
    const messages = await listMessages(viewer.env, viewer.userId, conversationId, {
      afterId: conversation.summaryThrough,
      limit: CONVERSATION_LIMITS.contextMessages,
    });
    const older = messagesToSummarize(messages);
    if (older.length === 0) return;

    const result = await generateAiText({
      viewer,
      feature: "conductor_summary",
      action: "summarize",
      instructions: SUMMARY_INSTRUCTIONS,
      prompt: summarySource(conversation.summary, older),
      maxOutputTokens: 700,
      reasoning: "low",
    });
    if (!result.ok) return;
    const summary = normalizeSummary(result.text);
    if (summary) await setConversationSummary(viewer.env, viewer.userId, conversationId, summary, older[older.length - 1].id);
  } catch (error) {
    console.error("[conductor] Could not summarise a conversation:", error instanceof Error ? error.message : "unknown error");
  }
}
