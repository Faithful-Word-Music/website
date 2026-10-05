import { CONDUCTOR_LIMITS, type ConductorTurn } from "./limits";

/**
 * The current Conductor conversation, as the browser holds it. There is one,
 * shared by the Conductor page and the floating panel
 * (src/components/conductor/conductor-store.ts) - this file is its rules:
 * what each event does to it, and how it is kept for the length of a browser
 * session. Nothing here is stored on the server.
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
}

export interface ConductorSession {
  messages: ConductorMessage[];
  /** An answer is on its way. */
  pending: boolean;
  /** What Conductor is doing just now (a key of conductorContent.status), until the answer starts. */
  status: string | null;
}

export const EMPTY_SESSION: ConductorSession = { messages: [], pending: false, status: null };

export type ConductorAction =
  | { type: "ask"; id: string; answerId: string; text: string }
  | { type: "status"; key: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "fail"; message: string }
  | { type: "stop" }
  | { type: "reset" }
  | { type: "restore"; session: ConductorSession };

/** The answer being written, when there is one. */
function withAnswer(session: ConductorSession, change: (answer: ConductorMessage) => ConductorMessage): ConductorMessage[] {
  const last = session.messages.at(-1);
  if (!session.pending || last?.role !== "assistant") return session.messages;
  return [...session.messages.slice(0, -1), change(last)];
}

export function conductorReducer(session: ConductorSession, action: ConductorAction): ConductorSession {
  switch (action.type) {
    case "ask": {
      // One question at a time.
      if (session.pending) return session;
      const text = action.text.trim();
      if (text === "") return session;
      return {
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
      return {
        messages: withAnswer(session, (answer) => ({ ...answer, error: action.message })),
        pending: false,
        status: null,
      };
    case "stop":
      if (!session.pending) return session;
      return {
        messages: withAnswer(session, (answer) => ({ ...answer, stopped: true })),
        pending: false,
        status: null,
      };
    case "reset":
      return EMPTY_SESSION;
    case "restore":
      return action.session;
  }
}

/**
 * The conversation as the model is sent it: what was said, in order. An
 * answer that never produced anything (it failed, or was stopped at once) is
 * left out along with nothing else - its question still stands.
 */
export function sessionTurns(session: ConductorSession): ConductorTurn[] {
  return session.messages
    .filter((message) => message.text.trim() !== "")
    .map((message) => ({ role: message.role, text: message.text }));
}

/** The question behind the last answer, for "Try again"; null when there is nothing to retry. */
export function retryQuestion(session: ConductorSession): string | null {
  if (session.pending) return null;
  const answer = session.messages.at(-1);
  const question = session.messages.at(-2);
  if (answer?.role !== "assistant" || !answer.error || question?.role !== "user") return null;
  return question.text;
}

/** The conversation without its last question and failed answer, ready for that question to be asked again. */
export function withoutLastExchange(session: ConductorSession): ConductorSession {
  return { messages: session.messages.slice(0, -2), pending: false, status: null };
}

// ---------------------------------------------------------------------------
// Keeping it for the browser session
// ---------------------------------------------------------------------------

/** sessionStorage: the conversation, and whose it is. Gone when the tab or the app closes. */
export const CONDUCTOR_SESSION_KEY = "fwm:conductor-session";

const VERSION = 1;

/** The conversation as stored. An answer still on its way is stored as stopped: nothing resumes it. */
export function serializeSession(userId: string, session: ConductorSession): string {
  const messages = session.messages.slice(-CONDUCTOR_LIMITS.storedTurns).map((message, index, list) => {
    const cutOff = session.pending && index === list.length - 1 && message.role === "assistant";
    return cutOff ? { ...message, stopped: true } : message;
  });
  return JSON.stringify({ v: VERSION, userId, messages });
}

/**
 * A stored conversation back again - but only its owner's. Anything
 * unreadable, from another version or left by someone else who used this
 * browser is no conversation at all.
 */
export function parseStoredSession(raw: string | null, userId: string): ConductorSession | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const stored = value as { v?: unknown; userId?: unknown; messages?: unknown } | null;
  if (!stored || stored.v !== VERSION || stored.userId !== userId || !Array.isArray(stored.messages)) return null;

  const messages: ConductorMessage[] = [];
  for (const item of stored.messages as Array<Record<string, unknown> | null>) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string") return null;
    if (item.role !== "user" && item.role !== "assistant") return null;
    messages.push({
      id: item.id,
      role: item.role,
      text: item.text,
      ...(typeof item.error === "string" ? { error: item.error } : {}),
      ...(item.stopped === true ? { stopped: true } : {}),
    });
  }
  return { messages, pending: false, status: null };
}
