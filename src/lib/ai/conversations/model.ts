import { describeAction, type ConductorAction } from "../conductor/actions";
import { CONDUCTOR_LIMITS, trimConversation, type ConductorTurn } from "../conductor/limits";

/**
 * Conductor's saved conversations: what one is, what its title is, and - the
 * part that matters most - how much of a long one goes back to the model.
 * Pure - shared by the server, the page and the tests.
 *
 * A conversation belongs to one person. Nobody else can list it, open it,
 * rename it or delete it, and it is never given to another AI feature:
 * Generate with AI and Suggest with AI have no way to ask for one.
 *
 * WHAT THE MODEL IS SENT of a conversation is never the whole transcript:
 *
 *   the latest turns, word for word   within the same bounds as ever
 *                                     (trimConversation: a number of turns and
 *                                     a total length)
 *   a summary of what came before     written by the model after the fact,
 *                                     kept on the conversation, and replaced
 *                                     as the conversation grows
 *
 * A summary is context for THIS conversation only. It is not memory: it is
 * never saved as one, never shown as one, and deleting the conversation
 * deletes it.
 */

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface StoredConversation extends ConversationSummary {
  /** Whether the title is the one worked out from the first question, or one the person typed. */
  titleSource: "auto" | "user";
  /** What the conversation covered before the messages still sent word for word. */
  summary: string | null;
  /** The last message the summary covers; nothing at or before it is sent again. */
  summaryThrough: number | null;
}

export type MessageStatus = "complete" | "stopped" | "error";

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  status: MessageStatus;
  /** On an answer that failed: what the person was told. */
  errorMessage: string | null;
  createdAt: string;
  /** What this answer proposed, and what became of each. */
  actions: ConductorAction[];
}

export const CONVERSATION_LIMITS = {
  titleChars: 80,
  /** Conversations listed for one person, newest first. */
  listed: 100,
  /** Messages of one conversation shown when it is opened: the latest ones. */
  shownMessages: 200,
  /** Messages read back, after the summary, to build what the model is sent. */
  contextMessages: 80,
  /** Messages that must have dropped out of the word-for-word part before a summary is (re)written. */
  summarizeAfter: 6,
  /** How much of each message a summary is written from. */
  summarySourceChars: 1500,
  /** ...and of them all. */
  summarySourceTotal: 18_000,
  summaryChars: 1600,
} as const;

/** A conversation's ID as the site gives it out (a UUID), so nothing else is ever passed to a query as one. */
export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** A title as it is stored: one line, within the limit. Null when there is nothing left. */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text === "" ? null : text.slice(0, CONVERSATION_LIMITS.titleChars).trim();
}

/** How long a title made from a question may be before it is cut at a word. */
const AUTO_TITLE_CHARS = 60;

/** A conversation's first title: its first question, cut at a word if it is long. */
export function titleFromQuestion(question: string, fallback: string): string {
  const text = question.replace(/\s+/g, " ").trim();
  if (text === "") return fallback;
  if (text.length <= AUTO_TITLE_CHARS) return text;
  const cut = text.slice(0, AUTO_TITLE_CHARS);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > AUTO_TITLE_CHARS / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** A stored message as a turn of the conversation: its words, and what any card it carried came to. */
function toTurn(message: StoredMessage): ConductorTurn {
  const cards = message.actions.map(describeAction);
  return { role: message.role, text: [message.text.trim(), ...cards].filter(Boolean).join("\n\n") };
}

export interface ConversationContext {
  /** The latest turns, ending with the question: what the model is sent word for word. */
  turns: ConductorTurn[];
  /** What came before them, when a summary has been written. */
  summary: string | null;
}

/**
 * What the model is sent of a conversation. `messages` are the stored
 * messages after the summary (oldest first), the question last. An answer
 * that never produced anything (it failed, or was stopped at once) is left
 * out; its question still stands.
 */
export function conversationContext(conversation: Pick<StoredConversation, "summary">, messages: readonly StoredMessage[]): ConversationContext {
  return { turns: trimConversation(messages.map(toTurn)), summary: conversation.summary?.trim() || null };
}

/**
 * The messages a summary should now take in: those that have dropped out of
 * the word-for-word part. Empty until enough have (summarizeAfter), so a
 * summary is not rewritten after every question. `messages` are the stored
 * messages after the current summary, oldest first, with no question pending.
 */
export function messagesToSummarize(messages: readonly StoredMessage[]): StoredMessage[] {
  const spoken = messages.filter((message) => toTurn(message).text !== "");
  if (spoken.length === 0) return [];
  // What the NEXT question would be sent word for word: the latest turns, leaving room for the question itself.
  const kept = trimConversation([...spoken.map(toTurn), { role: "user", text: "?" }]).length - 1;
  const older = spoken.slice(0, Math.max(0, spoken.length - Math.max(kept, 0)));
  return older.length >= CONVERSATION_LIMITS.summarizeAfter ? older : [];
}

/** The older messages as the text a summary is written from, bounded. */
export function summarySource(previous: string | null, messages: readonly StoredMessage[]): string {
  const { summarySourceChars, summarySourceTotal } = CONVERSATION_LIMITS;
  const lines: string[] = [];
  let length = 0;
  for (const message of messages) {
    const turn = toTurn(message);
    const text = turn.text.length > summarySourceChars ? `${turn.text.slice(0, summarySourceChars - 1).trimEnd()}…` : turn.text;
    const line = `${turn.role === "user" ? "PERSON" : "CONDUCTOR"}: ${text}`;
    if (length + line.length > summarySourceTotal) break;
    lines.push(line);
    length += line.length;
  }
  return [previous ? `SUMMARY SO FAR\n${previous}` : null, `MESSAGES TO ADD\n${lines.join("\n\n")}`].filter(Boolean).join("\n\n");
}

/** What the summarising model is told. It has no tools and writes nothing but the summary. */
export const SUMMARY_INSTRUCTIONS = `You keep the running summary of one conversation between a church's Music Director and Conductor, the assistant inside their website. The older part of the conversation is about to stop being sent to Conductor, and your summary takes its place.

Write the summary Conductor needs to carry on: what the person has been working on, which songs, services and dates were discussed, what they decided or preferred in this conversation, what was asked and what was concluded, and anything still open. Keep names, titles, hymnal numbers and dates exact. If a SUMMARY SO FAR is given, fold the new messages into it rather than starting again.

Rules:
- Only what the messages say. Add nothing, infer nothing, and do not give advice.
- Lines in square brackets record cards the person was shown and what they chose. Keep what they chose.
- This is a summary of a conversation, not a record of the church's music: write "Conductor reported that ..." for facts it looked up, since they will be looked up again.
- Plain prose or a short list, at most ${Math.round(CONVERSATION_LIMITS.summaryChars / 6)} words. No preamble.`;

/** A summary as it is stored: trimmed, and cut at the limit. Null when nothing usable came back. */
export function normalizeSummary(text: string): string | null {
  const summary = text.trim();
  if (summary === "") return null;
  return summary.length > CONVERSATION_LIMITS.summaryChars ? `${summary.slice(0, CONVERSATION_LIMITS.summaryChars - 1).trimEnd()}…` : summary;
}

/** How many of a person's questions fit in the word-for-word part: for the tests and AI.md. */
export const VERBATIM_TURNS = CONDUCTOR_LIMITS.historyTurns;
