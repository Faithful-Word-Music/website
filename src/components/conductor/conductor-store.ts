"use client";

import { useEffect, useSyncExternalStore } from "react";

import { aiContent } from "@/content/ai";
import { conductorContent } from "@/content/conductor";
import {
  ACTION_EVENT,
  CONVERSATION_EVENT,
  parseConductorAction,
  type ConductorAction as ProposedAction,
  type ConductorActionChoice,
} from "@/lib/ai/conductor/actions";
import { pageContextFor } from "@/lib/ai/conductor/context";
import { CONDUCTOR_ENDPOINT } from "@/lib/ai/conductor/protocol";
import {
  CONDUCTOR_ACTIVE_KEY,
  CONDUCTOR_LEGACY_SESSION_KEY,
  conductorReducer,
  EMPTY_SESSION,
  fromStoredMessages,
  parseActive,
  retryQuestion,
  serializeActive,
  withoutLastExchange,
  type ConductorAction,
  type ConductorSession,
} from "@/lib/ai/conductor/session";
import type { ConversationSummary, StoredMessage } from "@/lib/ai/conversations/model";
import type { AiErrorCode } from "@/lib/ai/errors";
import { parseStreamLine, splitStreamLines } from "@/lib/ai/stream";

/**
 * Conductor in this browser: THE conversation that is open, and the list of
 * the person's saved ones. There is exactly one of each - the Conductor page,
 * the desktop panel and the phone sheet are three views of this store, so a
 * question asked in one is there in the others, and opening Conductor
 * anywhere carries on with the conversation last open.
 *
 * The conversations themselves live on the server
 * (src/lib/ai/conversations), reached through /api/conductor: this store
 * shows them and asks for changes, and remembers only WHICH one was open
 * (localStorage, its id and whose it is). A reload, another tab, signing out
 * and in, a new deployment - the conversation is read back from the server.
 *
 * The store, not a component, owns the request. Closing the panel, opening
 * the full page or moving to another page leaves an answer streaming.
 */

/** The person's saved conversations, as far as this browser has asked. */
export interface ConductorHistory {
  status: "idle" | "loading" | "ready" | "error";
  conversations: ConversationSummary[];
}

interface State {
  session: ConductorSession;
  history: ConductorHistory;
}

const EMPTY: State = { session: EMPTY_SESSION, history: { status: "idle", conversations: [] } };

let state: State = EMPTY;
let owner: string | null = null;
let request: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
}

/** Which conversation to carry on with next time: only its id, never what was said. */
function rememberActive(conversationId: string | null) {
  if (!owner) return;
  try {
    if (conversationId) window.localStorage.setItem(CONDUCTOR_ACTIVE_KEY, serializeActive(owner, conversationId));
    else window.localStorage.removeItem(CONDUCTOR_ACTIVE_KEY);
  } catch {
    // Storage is full or blocked: Conductor simply opens on a new conversation next time.
  }
}

function dispatch(action: ConductorAction) {
  const session = conductorReducer(state.session, action);
  if (session === state.session) return;
  const moved = session.conversationId !== state.session.conversationId;
  set({ ...state, session });
  if (moved) rememberActive(session.conversationId);
}

function setHistory(history: ConductorHistory) {
  set({ ...state, history });
}

/** Puts a conversation at the top of the list, as the one last spoken in. */
function touch(conversation: ConversationSummary) {
  setHistory({
    ...state.history,
    conversations: [conversation, ...state.history.conversations.filter((item) => item.id !== conversation.id)],
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function readError(response: Response, fallback: string = conductorContent.errors.connection): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") return body.error;
  } catch {
    // Not JSON: fall through to the general wording.
  }
  return response.status === 401 ? conductorContent.errors.signedOut : fallback;
}

/** One request to /api/conductor/...; `ok: false` carries wording safe to show. */
async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; value: T } | { ok: false; status: number; error: string }> {
  try {
    const response = await fetch(`${CONDUCTOR_ENDPOINT}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, status: response.status, error: await readError(response, conductorContent.errors.unavailable) };
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, error: conductorContent.errors.connection };
  }
}

/** What a failed answer was stored with (an error code), back as what the person was told. */
const errorWords = (code: string | null) =>
  code && Object.hasOwn(aiContent.errors, code) ? aiContent.errors[code as AiErrorCode] : aiContent.errors.unknown;

// ---------------------------------------------------------------------------
// Saved conversations
// ---------------------------------------------------------------------------

/** Reads the person's saved conversations. Asked for when the list is first shown, and again on demand. */
async function loadHistory() {
  if (!owner || state.history.status === "loading") return;
  const asked = owner;
  setHistory({ ...state.history, status: "loading" });
  const result = await call<{ conversations: ConversationSummary[] }>("/conversations");
  if (owner !== asked) return;
  if (!result.ok) return setHistory({ ...state.history, status: "error" });
  // A conversation begun while the list was on its way is in the answer too; nothing is lost by taking the server's word.
  setHistory({ status: "ready", conversations: result.value.conversations });
}

/** Opens one of the person's saved conversations in place of whatever is open. */
async function open(conversationId: string) {
  if (!owner || (state.session.conversationId === conversationId && !state.session.loadError)) return;
  const asked = owner;
  request?.abort();
  request = null;
  const known = state.history.conversations.find((item) => item.id === conversationId);
  dispatch({ type: "open", id: conversationId, title: known?.title ?? null });

  const result = await call<{ conversation: ConversationSummary; messages: StoredMessage[] }>(`/conversations/${conversationId}`);
  if (owner !== asked) return;
  if (!result.ok) {
    // Gone (deleted elsewhere), or never this person's: it is no longer the conversation to come back to.
    if (result.status === 404) {
      setHistory({ ...state.history, conversations: state.history.conversations.filter((item) => item.id !== conversationId) });
      if (state.session.conversationId === conversationId) dispatch({ type: "reset" });
      return;
    }
    return dispatch({ type: "open-failed", id: conversationId, message: result.error });
  }
  dispatch({
    type: "opened",
    id: conversationId,
    title: result.value.conversation.title,
    messages: fromStoredMessages(result.value.messages, errorWords),
  });
}

async function rename(conversationId: string, title: string): Promise<{ ok: boolean; error?: string }> {
  const result = await call<{ title: string }>(`/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ title }) });
  if (!result.ok) return { ok: false, error: result.error };
  setHistory({
    ...state.history,
    conversations: state.history.conversations.map((item) => (item.id === conversationId ? { ...item, title: result.value.title } : item)),
  });
  dispatch({ type: "renamed", id: conversationId, title: result.value.title });
  return { ok: true };
}

async function remove(conversationId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await call<{ deleted: boolean }>(`/conversations/${conversationId}`, { method: "DELETE" });
  // Already gone is gone.
  if (!result.ok && result.status !== 404) return { ok: false, error: result.error };
  setHistory({ ...state.history, conversations: state.history.conversations.filter((item) => item.id !== conversationId) });
  if (state.session.conversationId === conversationId) {
    request?.abort();
    request = null;
    dispatch({ type: "reset" });
  }
  return { ok: true };
}

/** The person's choice on a card. Nothing is shown as saved until the server says it was. */
async function resolve(actionId: string, choice: ConductorActionChoice): Promise<{ ok: boolean; error?: string }> {
  const result = await call<{ action: unknown }>(`/actions/${actionId}`, { method: "POST", body: JSON.stringify({ choice }) });
  if (!result.ok) return { ok: false, error: result.error };
  const action = parseConductorAction(result.value.action);
  if (!action) return { ok: false, error: conductorContent.errors.unavailable };
  dispatch({ type: "resolved", action });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Whose it is
// ---------------------------------------------------------------------------

/** Whose Conductor this is. Called once the signed-in person is known; a different person starts afresh. */
function claim(userId: string | null) {
  if (userId === owner) return;
  request?.abort();
  request = null;
  owner = userId;
  set(EMPTY);
  if (!userId) return;

  let active: string | null = null;
  try {
    // Before conversations were saved, the whole of one was kept here for the tab. It is not read any more.
    window.sessionStorage.removeItem(CONDUCTOR_LEGACY_SESSION_KEY);
    active = parseActive(window.localStorage.getItem(CONDUCTOR_ACTIVE_KEY), userId);
    // Left by someone else, or unreadable: it is not this person's to come back to.
    if (!active) window.localStorage.removeItem(CONDUCTOR_ACTIVE_KEY);
  } catch {
    active = null;
  }
  if (active) void open(active);
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/**
 * Asks Conductor. `pathname` is the page it is being asked from, for "this
 * service" and "this song". `again` asks the conversation's last question
 * once more, in place of the answer it got.
 */
async function ask(text: string, pathname: string, again = false) {
  if (state.session.pending || state.session.loading || text.trim() === "") return;

  const conversationId = state.session.conversationId;
  dispatch({ type: "ask", id: newId(), answerId: newId(), text });

  const controller = new AbortController();
  request = controller;
  let finished = false;

  try {
    const response = await fetch(CONDUCTOR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text.trim(),
        conversationId,
        // The server takes the last exchange back only if this IS its question, so it is safe to ask even when
        // the question never arrived.
        retry: again && conversationId !== null,
        context: pageContextFor(pathname),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      dispatch({ type: "fail", message: await readError(response) });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!finished) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const { lines, rest } = splitStreamLines(done ? `${buffer}\n` : buffer);
      buffer = rest;
      for (const line of lines) {
        const event = parseStreamLine(line);
        if (!event) continue;
        if (event.type === "text") dispatch({ type: "delta", text: event.delta });
        else if (event.type === "status") dispatch({ type: "status", key: event.key });
        else if (event.type === "data") receive(event.name, event.value);
        else if (event.type === "done") {
          finished = true;
          dispatch({ type: "done" });
        } else {
          finished = true;
          dispatch({ type: "fail", message: event.message });
        }
      }
      if (done) break;
    }
    // The stream ended without saying it was finished: the connection dropped.
    if (!finished) dispatch({ type: "fail", message: conductorContent.errors.connection });
  } catch {
    // Stopped by the person: `stop` has already settled the conversation.
    if (!controller.signal.aborted) dispatch({ type: "fail", message: conductorContent.errors.connection });
  } finally {
    if (request === controller) request = null;
  }
}

/** What Conductor's server says beside the answer: which conversation this is, and anything it proposes. */
function receive(name: string, value: unknown) {
  if (name === CONVERSATION_EVENT) {
    const item = value as Partial<ConversationSummary> | null;
    if (!item || typeof item.id !== "string" || typeof item.title !== "string") return;
    const now = new Date().toISOString();
    const known = state.history.conversations.find((conversation) => conversation.id === item.id);
    dispatch({ type: "conversation", id: item.id, title: item.title });
    touch({
      id: item.id,
      title: known?.title ?? item.title,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : (known?.createdAt ?? now),
      lastMessageAt: typeof item.lastMessageAt === "string" ? item.lastMessageAt : now,
    });
  } else if (name === ACTION_EVENT) {
    const action = parseConductorAction(value);
    if (action) dispatch({ type: "propose", action });
  }
}

function stop() {
  request?.abort();
  request = null;
  dispatch({ type: "stop" });
}

/** A new conversation: nothing is stored until its first question is asked. */
function reset() {
  request?.abort();
  request = null;
  dispatch({ type: "reset" });
}

/** Asks the last question again, in place of the answer it got - after a failure, or for another go. */
function retry(pathname: string) {
  const question = retryQuestion(state.session);
  if (!question) return;
  dispatch({ type: "restore", session: withoutLastExchange(state.session) });
  void ask(question, pathname, true);
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

export interface Conductor {
  session: ConductorSession;
  history: ConductorHistory;
  ask: (text: string, pathname: string) => void;
  stop: () => void;
  /** Start a new conversation. */
  reset: () => void;
  retry: (pathname: string) => void;
  /** Read the saved conversations (again). */
  loadHistory: () => void;
  open: (conversationId: string) => void;
  rename: (conversationId: string, title: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (conversationId: string) => Promise<{ ok: boolean; error?: string }>;
  resolve: (actionId: string, choice: ConductorActionChoice) => Promise<{ ok: boolean; error?: string }>;
}

export type { ProposedAction };

/**
 * The shared Conductor, for whoever is signed in. Every view of Conductor
 * calls this with the same `userId` (from useAccount) and so sees the same
 * thing.
 */
export function useConductor(userId: string | null): Conductor {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    claim(userId);
  }, [userId]);

  return { session: current.session, history: current.history, ...commands };
}

/** The same functions every time, so an effect can depend on one without running again each render. */
const commands: Omit<Conductor, "session" | "history"> = {
  ask: (text, pathname) => void ask(text, pathname),
  stop,
  reset,
  retry,
  loadHistory: () => void loadHistory(),
  open: (conversationId) => void open(conversationId),
  rename,
  remove,
  resolve,
};
