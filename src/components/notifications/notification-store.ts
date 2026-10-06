"use client";

import { useEffect, useSyncExternalStore } from "react";

import { usePagePath } from "@/components/ui/use-page-path";
import { notificationsContent } from "@/content/notifications";
import { NOTIFICATION_LIMITS, type NotificationItem } from "@/lib/notifications/model";
import type { NotificationPage } from "@/lib/notifications/service";

/**
 * The signed-in person's notifications in this browser: how many are unread,
 * and the ones loaded so far. There is exactly one of these - the bell, its
 * panel and the Notifications page are three views of it, so reading one in
 * the panel takes it off the bell and the page at once.
 *
 * The notifications themselves live on the server, reached through
 * /api/account/notifications; this store shows them and asks for changes.
 * A change shows at once and is put back if the server refuses it.
 *
 * `unread` is THE unread count. Anything else that shows it reads it from
 * here: the installed app's icon badge does (PushSync.tsx).
 *
 * Kept fresh without a socket: asked again when a page is opened, when the
 * tab is looked at again, and once a minute while it is in view
 * (useNotificationSync) - and at once when a push arrives or is tapped, which
 * the service worker tells every open page (PushSync.tsx).
 */

const ENDPOINT = "/api/account/notifications";
const POLL_MS = 60_000;

export interface NotificationState {
  /** Whose these are; null when signed out. */
  userId: string | null;
  unread: number;
  /** `unread` has come from the server for this person: until then it is only a zero to start from. */
  counted: boolean;
  /** Newest first, as far as has been loaded. */
  items: NotificationItem[];
  /** Where the next page starts; null when everything is loaded. */
  nextCursor: number | null;
  /** The list has been loaded at least once for this person. */
  loaded: boolean;
  loading: boolean;
  /** Words for the last thing that failed, until something works. */
  error: string | null;
}

const EMPTY: NotificationState = {
  userId: null,
  unread: 0,
  counted: false,
  items: [],
  nextCursor: null,
  loaded: false,
  loading: false,
  error: null,
};

let state: NotificationState = EMPTY;
/** Changes sent to the server and not yet answered: what it says about read and unread may be a moment behind. */
let inFlight = 0;
const listeners = new Set<() => void>();

function set(next: Partial<NotificationState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

/** True while what came back is still for the person who asked. */
const stillFor = (userId: string) => state.userId === userId;

async function request<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean } & T;
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

/** Starts again for this person (or nobody): one person's notifications never show for the next. */
export function setNotificationUser(userId: string | null) {
  if (state.userId === userId) return;
  state = { ...EMPTY, userId };
  listeners.forEach((listener) => listener());
}

/** Asks only for the count: what the bell needs, and cheap enough to ask often. */
export async function refreshUnread() {
  const { userId } = state;
  if (!userId) return;
  const data = await request<{ unread: number }>(`${ENDPOINT}/unread`);
  if (!data || !stillFor(userId)) return;
  const changed = data.unread !== state.unread;
  set({ unread: data.unread, counted: true });
  // Something arrived (or was read elsewhere): a list already on show follows.
  if (changed && state.loaded && !state.loading) void loadNotifications();
}

/** Loads the newest page, replacing what was there. */
export async function loadNotifications() {
  const { userId } = state;
  if (!userId || state.loading) return;
  set({ loading: true });
  const page = await request<NotificationPage>(`${ENDPOINT}?limit=${NOTIFICATION_LIMITS.page}`);
  if (!stillFor(userId)) return;
  if (!page) return set({ loading: false, error: notificationsContent.errors.load });
  set({ items: page.items, nextCursor: page.nextCursor, unread: page.unread, counted: true, loaded: true, loading: false, error: null });
}

/** Adds the next, older page to the end. */
export async function loadMoreNotifications() {
  const { userId, nextCursor } = state;
  if (!userId || state.loading || nextCursor === null) return;
  set({ loading: true });
  const page = await request<NotificationPage>(`${ENDPOINT}?before=${nextCursor}&limit=${NOTIFICATION_LIMITS.page}`);
  if (!stillFor(userId)) return;
  if (!page) return set({ loading: false, error: notificationsContent.errors.load });
  const known = new Set(state.items.map((item) => item.id));
  set({
    items: [...state.items, ...page.items.filter((item) => !known.has(item.id))],
    nextCursor: page.nextCursor,
    unread: page.unread,
    counted: true,
    loading: false,
    error: null,
  });
}

/** What the server rendered into the Notifications page, so it need not be asked for again. */
export function hydrateNotifications(userId: string, page: NotificationPage) {
  if (state.userId !== null && state.userId !== userId) return;
  // The server's page is the newest word on the newest notifications; older
  // pages already loaded here stay beneath it.
  const oldest = page.items.length > 0 ? page.items[page.items.length - 1].id : Number.POSITIVE_INFINITY;
  const older = state.loaded && page.nextCursor !== null ? state.items.filter((item) => item.id < oldest) : [];
  // A notification opened from the bell is marked read as its page loads: the
  // page may have been rendered before that landed. What was just done here wins.
  const local = inFlight > 0 ? new Map(state.items.map((item) => [item.id, item.readAt])) : null;
  const items = local ? page.items.map((item) => (local.has(item.id) ? { ...item, readAt: local.get(item.id) ?? null } : item)) : page.items;
  state = {
    ...state,
    userId,
    items: [...items, ...older],
    nextCursor: older.length > 0 ? state.nextCursor : page.nextCursor,
    unread: local ? state.unread : page.unread,
    counted: true,
    loaded: true,
    error: null,
  };
  listeners.forEach((listener) => listener());
}

async function change(body: Record<string, unknown>, before: Pick<NotificationState, "items" | "unread">) {
  const { userId } = state;
  if (!userId) return;
  inFlight += 1;
  const data = await request<{ unread: number }>(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  inFlight -= 1;
  if (!stillFor(userId)) return;
  // Refused: put it back as it was, and say so.
  if (!data) return set({ ...before, error: notificationsContent.errors.update });
  set({ unread: data.unread, counted: true, error: null });
}

/** Marks one read or unread: at once here, then on the server. */
export function markNotification(id: number, read: boolean) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || (item.readAt !== null) === read) return;
  const before = { items: state.items, unread: state.unread };
  set({
    items: state.items.map((entry) => (entry.id === id ? { ...entry, readAt: read ? new Date().toISOString() : null } : entry)),
    unread: Math.max(0, state.unread + (read ? -1 : 1)),
  });
  void change({ action: read ? "read" : "unread", id }, before);
}

export function markAllNotificationsRead() {
  if (state.unread === 0) return;
  const before = { items: state.items, unread: state.unread };
  const now = new Date().toISOString();
  set({ items: state.items.map((entry) => (entry.readAt ? entry : { ...entry, readAt: now })), unread: 0 });
  void change({ action: "read-all" }, before);
}

/**
 * A push arrived, or something else changed on the server: the count, and a
 * list already on show. A folded notification replaces another without
 * changing the count, so a list that is showing is always loaded again.
 */
export async function refreshNotifications() {
  if (state.loaded) await loadNotifications();
  else await refreshUnread();
}

/**
 * A push was tapped while the site was open (PushSync.tsx): that
 * notification is read. One already in the list is marked as any other is;
 * one not loaded here is marked on the server and the count follows. A
 * notification that never showed in the app (push only) has nothing to mark,
 * which is not an error.
 */
export async function openedFromPush(id: number | null) {
  const { userId } = state;
  if (!userId) return;
  if (id !== null) {
    if (state.items.some((entry) => entry.id === id)) {
      markNotification(id, true);
      return;
    }
    inFlight += 1;
    const data = await request<{ unread: number }>(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
    inFlight -= 1;
    if (!stillFor(userId)) return;
    if (data) set({ unread: data.unread, counted: true });
  }
  await refreshNotifications();
}

export function useNotifications(): NotificationState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Keeps the count current for the signed-in person. Called once, by the bell,
 * which is on every page; signing out clears everything.
 */
export function useNotificationSync(userId: string | null) {
  const pathname = usePagePath();

  useEffect(() => {
    setNotificationUser(userId);
  }, [userId]);

  // A new page: a fresh count (and the first one, on arriving).
  useEffect(() => {
    if (userId) void refreshUnread();
  }, [userId, pathname]);

  useEffect(() => {
    if (!userId) return;
    const visible = () => document.visibilityState === "visible";
    const onReturn = () => {
      if (visible()) void refreshUnread();
    };
    const timer = setInterval(onReturn, POLL_MS);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [userId]);
}
