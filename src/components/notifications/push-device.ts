"use client";

import { useSyncExternalStore } from "react";

import { isStandalone } from "@/components/app/standalone";
import { notificationsContent } from "@/content/notifications";
import { isVapidPublicKey, pushDeviceState, vapidKeyBytes, type PushDeviceState } from "@/lib/notifications/push";

/**
 * Push on THIS browser or installed app: whether it can receive push, whether
 * the person has switched it on here, and the three things they can do about
 * it (switch it on, switch it off, reconnect it).
 *
 * This is the device's side, and only that. Which notifications a person
 * hears about is their notification settings, kept on the server and the same
 * on every device; the notifications themselves are in notification-store.ts,
 * still the one store of those.
 *
 * Three rules it keeps:
 *
 *   - The browser is asked for permission ONLY from enablePush(), which is
 *     only ever called by a button being pressed. Nothing here asks on load.
 *   - A device belongs to whoever is signed in on it. The server says whose
 *     an endpoint is (from the session); this file only remembers, in this
 *     browser, WHO switched push on here, so that the same person signing in
 *     again is reconnected without being asked, and anyone else is not.
 *   - Signing out stops push to this device: the server forgets it, and the
 *     browser's own subscription is ended, so nothing addressed to one person
 *     can reach the next.
 */

const ENDPOINT = "/api/account/push";
const SERVICE_WORKER = "/sw.js";
/** Who switched push on in this browser (a Clerk user id). Removed when they switch it off. */
const OWNER_KEY = "fwm:push-owner";
const copy = notificationsContent.device;

/** The site's public push key, put into the bundle at build time. Empty when push is not set up. */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
const CONFIGURED = isVapidPublicKey(PUBLIC_KEY);

export interface PushDevice {
  /** "checking" until the browser has been asked, which is never on the server. */
  status: "checking" | PushDeviceState;
  /** What is under way, so its button can say so. */
  busy: "enable" | "disable" | "repair" | null;
  error: string | null;
}

const CHECKING: PushDevice = { status: "checking", busy: null, error: null };

let state: PushDevice = CHECKING;
/** Whose device state this is: a late answer for someone who has since signed out is dropped. */
let currentUser: string | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<PushDevice>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePushDevice(): PushDevice {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CHECKING,
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function owner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Not remembered: this person will be asked to switch push on again next time.
  }
}

/** The service worker, registered if it is not yet. Only ever for someone signed in. */
async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  // updateViaCache "none": a new version of the worker is never held back by the browser's cache.
  await navigator.serviceWorker.register(SERVICE_WORKER, { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** Whether a subscription was made with the site's current key. One made with an old key can no longer be sent to. */
function madeWithCurrentKey(subscription: PushSubscription): boolean {
  const used = subscription.options?.applicationServerKey;
  // A browser that does not say: taken on trust, and the server's answer decides.
  if (!used) return true;
  const mine = vapidKeyBytes(PUBLIC_KEY);
  const theirs = new Uint8Array(used);
  return theirs.length === mine.length && theirs.every((byte, index) => byte === mine[index]);
}

async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ registered: boolean } | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; registered?: boolean };
    return data.ok ? { registered: data.registered === true } : null;
  } catch {
    return null;
  }
}

/** Subscribes this browser (replacing a subscription made with an old key) and registers it to the signed-in person. */
async function connect(): Promise<boolean> {
  const registration = await serviceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !madeWithCurrentKey(subscription)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(PUBLIC_KEY) });
  const saved = await call({ action: "register", subscription: subscription.toJSON() });
  return saved?.registered === true;
}

async function read(userId: string): Promise<PushDeviceState> {
  const can = CONFIGURED && supported();
  const mine = owner() === userId;
  let subscribed = false;
  let keyMatches = true;
  let registered = false;
  if (can && Notification.permission === "granted" && mine) {
    const registration = await serviceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      subscribed = true;
      keyMatches = madeWithCurrentKey(subscription);
      registered = (await call({ action: "status", endpoint: subscription.endpoint }))?.registered === true;
    }
  }
  return pushDeviceState({
    configured: CONFIGURED,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    supported: supported(),
    permission: "Notification" in window ? Notification.permission : "default",
    subscribed,
    keyMatches,
    mine,
    registered,
  });
}

/**
 * Looks at this device for the signed-in person. If they switched push on
 * here before and the connection has since been lost (they signed out and
 * back in, the browser replaced its subscription, the site's keys changed),
 * it is mended without a word: permission is already theirs, so nothing is
 * asked. Only if that fails does the page say it needs reconnecting.
 */
export async function refreshPushDevice(userId: string): Promise<void> {
  currentUser = userId;
  try {
    let status = await read(userId);
    if (status === "needs-repair") {
      await connect().catch(() => false);
      status = await read(userId);
    }
    if (currentUser === userId) set({ status, error: null });
  } catch {
    if (currentUser === userId) set({ status: supported() ? "off" : "unsupported" });
  }
}

/**
 * Switches push on for this device. Called from a button press and nowhere
 * else: asking for permission is the first thing it does, while the press
 * still counts as the person's own (iPhone and iPad insist on that).
 */
export async function enablePush(userId: string): Promise<void> {
  if (!CONFIGURED || !supported() || state.busy) return;
  const asking = Notification.permission === "granted" ? Promise.resolve<NotificationPermission>("granted") : Notification.requestPermission();
  set({ busy: "enable", error: null });
  try {
    const permission = await asking;
    if (permission !== "granted") {
      // "denied" is final until the person changes it in the browser; closing the prompt leaves it open to try again.
      return set({ busy: null, status: permission === "denied" ? "denied" : "off", error: permission === "denied" ? null : copy.errors.notGranted });
    }
    setOwner(userId);
    if (!(await connect())) {
      setOwner(null);
      return set({ busy: null, error: copy.errors.failed });
    }
    set({ busy: null, status: "enabled", error: null });
  } catch {
    setOwner(null);
    set({ busy: null, error: copy.errors.failed });
  }
}

/** Reconnects a device that was switched on and lost its connection. Asks nothing: permission was already given. */
export async function repairPush(userId: string): Promise<void> {
  if (!CONFIGURED || !supported() || state.busy) return;
  set({ busy: "repair", error: null });
  const mended = await connect().catch(() => false);
  if (!mended) return set({ busy: null, error: copy.errors.failed });
  set({ busy: null });
  await refreshPushDevice(userId);
}

/** Ends push to this device, here and on the server. `forget`: this was the person's own choice, not a sign-out. */
async function disconnect(forget: boolean, signal?: AbortSignal): Promise<void> {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  if (forget) setOwner(null);
  if (!subscription) return;
  // The server first, while the session can still say whose it is; then the
  // browser's own subscription, after which the endpoint is dead whatever the server holds.
  await call({ action: "remove", endpoint: subscription.endpoint }, signal);
  await subscription.unsubscribe().catch(() => false);
}

/** Switches push off for this device. The person's other devices, and their notification settings, are untouched. */
export async function disablePush(): Promise<void> {
  if (state.busy) return;
  set({ busy: "disable", error: null });
  try {
    await disconnect(true);
    set({ busy: null, status: "off" });
  } catch {
    set({ busy: null, error: copy.errors.failed });
  }
}

/** How long signing out waits for push to be disconnected before going ahead regardless. */
const SIGN_OUT_WAIT_MS = 2_500;

/**
 * Before signing out: this device stops receiving the person's notifications.
 * Never in the way of signing out - it gives up after a moment, and the
 * signed-out page finishes the job (releaseSignedOutDevice).
 *
 * Who switched push on here is still remembered, so the same person signing
 * in again is reconnected; anyone else starts with it off.
 */
export async function disconnectForSignOut(): Promise<void> {
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), SIGN_OUT_WAIT_MS);
  try {
    await Promise.race([disconnect(false, giveUp.signal), new Promise((resolve) => setTimeout(resolve, SIGN_OUT_WAIT_MS))]);
  } catch {
    // Signing out goes ahead.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nobody is signed in, and this browser still holds a push subscription - a
 * session that ended some other way (it expired, the account was disabled,
 * the device was signed out from elsewhere). The subscription is ended here,
 * which no session is needed for; the server retires its record of it the
 * next time it tries the dead endpoint.
 */
export async function releaseSignedOutDevice(): Promise<void> {
  currentUser = null;
  set({ ...CHECKING });
  try {
    if (!supported()) return;
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER);
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Nothing to end, or nothing that can be done about it from here.
  }
}
