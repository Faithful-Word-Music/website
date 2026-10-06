import type { StoredMessage } from "../conversations/model";
import type { ConductorAction as ProposedAction } from "./actions";

/**
 * The Conductor conversation the browser has open. There is one, shared by
 * the Conductor page, the desktop panel and the phone sheet
 * (src/components/conductor/conductor-store.ts) - this file is its rules:
 * what each event does to it.
 *
 * The conversation itself is kept on the server (src/lib/ai/conversations).
 * What is here is the browser's view of it: the messages as they are being
 * shown, and which saved conversation they belong to. The only thing the
 * browser remembers for itself is WHICH conversation was open, so Conductor
 * carries on with it wherever it is next opened.
 *
 * Pure - no browser API - so it can be unit tested.
 */

export interface ConductorMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** On an answer that failed: what to tell the person. */
  error?: string;
  /** On an answer the person stopped (or that a reload cut off). */
  stopped?: boolean;
  /** What this answer proposed - a memory to save, a change to the philosophy - each shown as a card. */
  actions?: ProposedAction[];
}

export interface ConductorSession {
  /** The saved conversation this is; null for a new one nothing has been asked in yet. */
  conversationId: string | null;
  title: string | null;
  messages: ConductorMessage[];
  /** An answer is on its way. */
  pending: boolean;
  /** What Conductor is doing just now (a key of conductorContent.status), until the answer starts. */
  status: string | null;
  /** A saved conversation is being opened. */
  loading: boolean;
  /** It could not be opened: what to tell the person. */
  loadError: string | null;
}

export const EMPTY_SESSION: ConductorSession = {
  conversationId: null,
  title: null,
  messages: [],
  pending: false,
  status: null,
  loading: false,
  loadError: null,
};

export type ConductorAction =
  | { type: "ask"; id: string; answerId: string; text: string }
  | { type: "status"; key: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "fail"; message: string }
  | { type: "stop" }
  | { type: "reset" }
  | { type: "restore"; session: ConductorSession }
  /** The server has said which saved conversation the answer on its way belongs to. */
  | { type: "conversation"; id: string; title: string }
  /** The answer on its way has proposed something. */
  | { type: "propose"; action: ProposedAction }
  /** The person has chosen on a card, and the server has settled it. */
  | { type: "resolved"; action: ProposedAction }
  /** A saved conversation is being opened... */
  | { type: "open"; id: string; title: string | null }
  /** ...and has arrived, or could not be read. Ignored unless it is still the one being opened. */
  | { type: "opened"; id: string; title: string; messages: ConductorMessage[] }
  | { type: "open-failed"; id: string; message: string }
  | { type: "renamed"; id: string; title: string };

/** The answer being written, when there is one. */
function withAnswer(session: ConductorSession, change: (answer: ConductorMessage) => ConductorMessage): ConductorMessage[] {
  const last = session.messages.at(-1);
  if (!session.pending || last?.role !== "assistant") return session.messages;
  return [...session.messages.slice(0, -1), change(last)];
}

export function conductorReducer(session: ConductorSession, action: ConductorAction): ConductorSession {
  switch (action.type) {
    case "ask": {
      // One question at a time, and none while a conversation is still being opened.
      if (session.pending || session.loading) return session;
      const text = action.text.trim();
      if (text === "") return session;
      return {
        ...session,
        loadError: null,
        messages: [
          ...session.messages,
          { id: action.id, role: "user", text },
          { id: action.answerId, role: "assistant", text: "" },
        ],
        pending: true,
        status: null,
      };
    }
    case "status":
      return session.pending ? { ...session, status: action.key } : session;
    case "delta":
      if (!session.pending) return session;
      return { ...session, status: null, messages: withAnswer(session, (answer) => ({ ...answer, text: answer.text + action.text })) };
    case "done":
      return session.pending ? { ...session, pending: false, status: null } : session;
    case "fail":
      if (!session.pending) return session;
      return { ...session, messages: withAnswer(session, (answer) => ({ ...answer, error: action.message })), pending: false, status: null };
    case "stop":
      if (!session.pending) return session;
      return { ...session, messages: withAnswer(session, (answer) => ({ ...answer, stopped: true })), pending: false, status: null };
    case "reset":
      return EMPTY_SESSION;
    case "restore":
      return action.session;
    case "conversation":
      // Only the answer on its way can say which conversation it belongs to.
      return session.pending ? { ...session, conversationId: action.id, title: session.title ?? action.title } : session;
    case "propose":
      if (!session.pending) return session;
      return { ...session, status: null, messages: withAnswer(session, (answer) => ({ ...answer, actions: [...(answer.actions ?? []), action.action] })) };
    case "resolved":
      return {
        ...session,
        messages: session.messages.map((message) =>
          message.actions?.some((item) => item.id === action.action.id)
            ? { ...message, actions: message.actions.map((item) => (item.id === action.action.id ? action.action : item)) }
            : message,
        ),
      };
    case "open":
      return { ...EMPTY_SESSION, conversationId: action.id, title: action.title, loading: true };
    case "opened":
      if (session.conversationId !== action.id || !session.loading) return session;
      return { ...EMPTY_SESSION, conversationId: action.id, title: action.title, messages: action.messages };
    case "open-failed":
      if (session.conversationId !== action.id || !session.loading) return session;
      return { ...EMPTY_SESSION, loadError: action.message };
    case "renamed":
      return session.conversationId === action.id ? { ...session, title: action.title } : session;
  }
}

/**
 * The question behind the last answer, for "Try again" - after a failure, or
 * simply for another go at an answer; null while one is still on its way, or
 * when there is nothing to ask again.
 */
export function retryQuestion(session: ConductorSession): string | null {
  if (session.pending || session.loading) return null;
  const answer = session.messages.at(-1);
  const question = session.messages.at(-2);
  if (answer?.role !== "assistant" || question?.role !== "user") return null;
  return question.text;
}

/** The conversation without its last question and answer, ready for that question to be asked again. */
export function withoutLastExchange(session: ConductorSession): ConductorSession {
  return { ...session, messages: session.messages.slice(0, -2), pending: false, status: null };
}

/**
 * A saved conversation's messages as the page shows them. `errorWords` turns
 * the code a failed answer was stored with back into what the person was told.
 */
export function fromStoredMessages(messages: readonly StoredMessage[], errorWords: (code: string | null) => string): ConductorMessage[] {
  return messages.map((message) => ({
    id: `m${message.id}`,
    role: message.role,
    text: message.text,
    ...(message.status === "error" ? { error: errorWords(message.errorMessage) } : {}),
    ...(message.status === "stopped" ? { stopped: true } : {}),
    ...(message.actions.length > 0 ? { actions: message.actions } : {}),
  }));
}

/** Whether any card in the conversation is still waiting for the person. */
export function hasPendingAction(session: ConductorSession): boolean {
  return session.messages.some((message) => message.actions?.some((action) => action.status === "pending"));
}

// ---------------------------------------------------------------------------
// Remembering which conversation was open
// ---------------------------------------------------------------------------

/** localStorage: the conversation last open, and whose it is. Only its id - never anything said in it. */
export const CONDUCTOR_ACTIVE_KEY = "fwm:conductor-active";
/** sessionStorage: where the whole conversation used to be kept, before conversations were saved. Cleared when found. */
export const CONDUCTOR_LEGACY_SESSION_KEY = "fwm:conductor-session";

export function serializeActive(userId: string, conversationId: string): string {
  return JSON.stringify({ v: 1, userId, conversationId });
}

/**
 * The conversation last open - but only its owner's. Anything unreadable, or
 * left by someone else who used this browser, is no conversation at all. (The
 * server would refuse another person's id anyway.)
 */
export function parseActive(raw: string | null, userId: string): string | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as { v?: unknown; userId?: unknown; conversationId?: unknown } | null;
    if (!stored || stored.v !== 1 || stored.userId !== userId || typeof stored.conversationId !== "string") return null;
    return /^[0-9a-f-]{36}$/i.test(stored.conversationId) ? stored.conversationId : null;
  } catch {
    return null;
  }
}
