"use client";

import { useEffect, useSyncExternalStore } from "react";

import { conductorContent } from "@/content/conductor";
import { pageContextFor } from "@/lib/ai/conductor/context";
import { trimConversation } from "@/lib/ai/conductor/limits";
import { CONDUCTOR_ENDPOINT } from "@/lib/ai/conductor/protocol";
import {
  CONDUCTOR_SESSION_KEY,
  conductorReducer,
  EMPTY_SESSION,
  parseStoredSession,
  retryQuestion,
  serializeSession,
  sessionTurns,
  withoutLastExchange,
  type ConductorAction,
  type ConductorSession,
} from "@/lib/ai/conductor/session";
import { parseStreamLine, splitStreamLines } from "@/lib/ai/stream";

/**
 * THE Conductor conversation in this browser tab. There is exactly one: the
 * Conductor page and the floating panel are two views of this store, so a
 * question asked in one is there in the other, and "New conversation" clears
 * both. Its rules are in src/lib/ai/conductor/session.ts.
 *
 * The store, not a component, owns the request. Closing the panel, opening
 * the full page or moving to another page leaves an answer streaming.
 *
 * It lives for the browser session: kept in sessionStorage (so a reload keeps
 * it), gone when the tab or the installed app closes, and never sent anywhere
 * but back to Conductor with the next question. Someone else signing in here
 * starts with nothing.
 */

let session: ConductorSession = EMPTY_SESSION;
let owner: string | null = null;
let request: AbortController | null = null;
const listeners = new Set<() => void>();

function persist() {
  if (!owner) return;
  try {
    if (session.messages.length === 0) window.sessionStorage.removeItem(CONDUCTOR_SESSION_KEY);
    else window.sessionStorage.setItem(CONDUCTOR_SESSION_KEY, serializeSession(owner, session));
  } catch {
    // Storage is full or blocked: the conversation simply lasts until the page is reloaded.
  }
}

function dispatch(action: ConductorAction) {
  const next = conductorReducer(session, action);
  if (next === session) return;
  session = next;
  // Not on every word of an answer - once it is under way, only when it changes state.
  if (action.type !== "delta" && action.type !== "status") persist();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whose conversation this is. Called once the signed-in person is known; a different person starts afresh. */
function claim(userId: string | null) {
  if (userId === owner) return;
  request?.abort();
  request = null;
  owner = userId;
  let restored: ConductorSession | null = null;
  if (userId) {
    try {
      restored = parseStoredSession(window.sessionStorage.getItem(CONDUCTOR_SESSION_KEY), userId);
      // Left by someone else, or unreadable: it is not this person's to see.
      if (!restored) window.sessionStorage.removeItem(CONDUCTOR_SESSION_KEY);
    } catch {
      restored = null;
    }
  }
  session = restored ?? EMPTY_SESSION;
  listeners.forEach((listener) => listener());
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") return body.error;
  } catch {
    // Not JSON: fall through to the general wording.
  }
  return response.status === 401 ? conductorContent.errors.signedOut : conductorContent.errors.connection;
}

/** Asks Conductor. `pathname` is the page it is being asked from, for "this service" and "this song". */
async function ask(text: string, pathname: string) {
  if (session.pending || text.trim() === "") return;

  const turns = trimConversation([...sessionTurns(session), { role: "user", text }]);
  dispatch({ type: "ask", id: newId(), answerId: newId(), text });

  const controller = new AbortController();
  request = controller;
  let finished = false;

  try {
    const response = await fetch(CONDUCTOR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: turns, context: pageContextFor(pathname) }),
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

function stop() {
  request?.abort();
  request = null;
  dispatch({ type: "stop" });
}

function reset() {
  request?.abort();
  request = null;
  dispatch({ type: "reset" });
}

/** Asks the last question again after a failure, in place of the failed answer. */
function retry(pathname: string) {
  const question = retryQuestion(session);
  if (!question) return;
  dispatch({ type: "restore", session: withoutLastExchange(session) });
  void ask(question, pathname);
}

const getSnapshot = () => session;
const getServerSnapshot = () => EMPTY_SESSION;

export interface Conductor {
  session: ConductorSession;
  ask: (text: string, pathname: string) => void;
  stop: () => void;
  reset: () => void;
  retry: (pathname: string) => void;
}

/**
 * The shared conversation, for whoever is signed in. Every view of Conductor
 * calls this with the same `userId` (from useAccount) and so sees the same
 * thing.
 */
export function useConductor(userId: string | null): Conductor {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    claim(userId);
  }, [userId]);

  return { session: current, ask: (text, pathname) => void ask(text, pathname), stop, reset, retry };
}
