/**
 * Push: what is sent to a device, and what a device may hand the site.
 *
 * Push is a CHANNEL (model.ts), not a second kind of notification. Whether a
 * person receives a category by push is decided where every channel is
 * decided - the category's policy and their own choice, effectiveSetting().
 * What is here comes after that: the small message a device is sent, the tag
 * that makes a folded notification replace its predecessor on the device too,
 * and the checks on a browser's push subscription.
 *
 * Two things that are not each other:
 *
 *   a preference     "should this person hear about this category by push?"
 *                    One per person and category, in the site.
 *   a subscription   "where can a push physically be sent?" One per browser
 *                    or installed app, and a person may have several.
 *
 * Pure - no server-only import, no browser API - so it is unit tested and
 * shared by the server, the pages and the tests of the service worker
 * (public/sw.js, which cannot import this and checks a payload the same way).
 */

import { isIosDevice } from "@/lib/install";

import { NOTIFICATION_LIMITS, safeActionUrl, type NotificationPriority } from "./model";

/** Where a push leads when its notification has no page of its own. */
export const PUSH_FALLBACK_URL = "/notifications";

/** How many browsers and installed apps one person may have registered. The least recently seen goes first. */
export const MAX_SUBSCRIPTIONS = 10;

// ---------------------------------------------------------------------------
// The message a device is sent
// ---------------------------------------------------------------------------

/** One person's notification, on its way to their devices. Built in notify() (service.ts). */
export interface PushMessage {
  notificationId: number;
  eventId: number;
  userId: string;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  /** What it replaces on a device: see pushTag(). */
  tag: string;
  /** Whether the tag is shared with related notifications (an event that folds). */
  folds: boolean;
}

/**
 * What the service worker is sent, and nothing more: what to show, where it
 * leads, what it replaces, and the count for the app's icon. The event's own
 * payload (service.ts) is never here - it stays on the server.
 */
export interface PushPayload {
  v: 1;
  /** The notification's id: what a tap marks read. */
  id: number;
  title: string;
  body: string;
  /** A page on this site. */
  url: string;
  tag: string;
  /** The person's unread notifications in the app, after this one. */
  unread: number;
  priority: NotificationPriority;
}

/**
 * The tag a device files a push under. A device shows one notification per
 * tag: a second with the same tag replaces the first.
 *
 * An event that folds (catalog.ts) and says what it is about is tagged with
 * its family and entity - exactly what folds it in the app - so five quick
 * corrections to one service are one notification on the phone as well.
 * Anything else is tagged with its own id, and so never replaces anything.
 */
export function pushTag(
  coalesce: { family: string } | null | undefined,
  entity: { type: string; id: string } | null | undefined,
  notificationId: number,
): { tag: string; folds: boolean } {
  if (coalesce && entity) return { tag: `${coalesce.family}|${entity.type}:${entity.id}`.slice(0, 200), folds: true };
  return { tag: `n:${notificationId}`, folds: false };
}

/** How soon the push service should wake a sleeping device: at once for what matters, in its own time otherwise. */
export function pushUrgency(priority: NotificationPriority): "normal" | "high" {
  return priority === "normal" ? "normal" : "high";
}

const wholeCount = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function buildPushPayload(message: PushMessage, unread: number): PushPayload {
  return {
    v: 1,
    id: message.notificationId,
    title: message.title,
    body: message.body,
    // Checked again here, whatever was stored: a push never leads off the site.
    url: safeActionUrl(message.actionUrl) ?? PUSH_FALLBACK_URL,
    tag: message.tag,
    unread: wholeCount(unread),
    priority: message.priority,
  };
}

/** A payload as a device should accept it, or null. public/sw.js makes the same checks. */
export function parsePushPayload(value: unknown): PushPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (data.v !== 1) return null;
  if (typeof data.id !== "number" || !Number.isInteger(data.id) || data.id <= 0) return null;
  if (typeof data.title !== "string" || data.title === "" || data.title.length > NOTIFICATION_LIMITS.titleChars) return null;
  if (typeof data.body !== "string" || data.body.length > NOTIFICATION_LIMITS.bodyChars) return null;
  if (typeof data.url !== "string" || !safeActionUrl(data.url)) return null;
  if (typeof data.tag !== "string" || data.tag === "") return null;
  if (typeof data.unread !== "number") return null;
  const priority = data.priority === "important" || data.priority === "critical" ? data.priority : "normal";
  return { v: 1, id: data.id, title: data.title, body: data.body, url: data.url, tag: data.tag, unread: wholeCount(data.unread), priority };
}

/**
 * What the service worker tells an open page when a push is tapped: which
 * notification, and where to go. The address is checked again by the page -
 * a message is never followed off the site.
 */
export function parsePushClick(value: unknown): { id: number | null; url: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  const url = typeof data.url === "string" ? safeActionUrl(data.url) : null;
  const id = typeof data.id === "number" && Number.isInteger(data.id) && data.id > 0 ? data.id : null;
  return { id, url: url ?? PUSH_FALLBACK_URL };
}

/** The page a tapped push opens when the site is not open: it marks the notification read, then goes on (app/notifications/open). */
export function pushOpenPath(notificationId: number): string {
  return `/notifications/open/${notificationId}`;
}

// ---------------------------------------------------------------------------
// The app's icon
// ---------------------------------------------------------------------------

/** What the installed app's icon should show for this many unread: the number, or nothing at all. */
export function appBadge(unread: number): { set: number } | { clear: true } {
  const count = wholeCount(unread);
  return count > 0 ? { set: count } : { clear: true };
}

// ---------------------------------------------------------------------------
// A browser's subscription
// ---------------------------------------------------------------------------

/**
 * The push services browsers use. A subscription's endpoint is an address the
 * SERVER will post to, given to it by a browser - so only these are accepted,
 * and the site can never be made to call an address of someone's choosing.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox
  "push.services.mozilla.com",
  // Safari, and every installed app on iPhone and iPad
  "push.apple.com",
  // Edge on Windows
  "notify.windows.com",
];

function isPushServiceHost(host: string): boolean {
  return PUSH_SERVICE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const ENDPOINT_CHARS = 2000;

/** A push service's address: https, one of the known services, nothing odd about it. */
export function parseEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > ENDPOINT_CHARS) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return null;
  return isPushServiceHost(url.hostname.toLowerCase()) ? url.toString() : null;
}

/**
 * What a browser's PushSubscription.toJSON() gives, checked: the endpoint and
 * the two keys a message to it is encrypted with. Null when it is anything
 * else. Nothing in it says whose it is - that is the session's to say.
 */
export function parseSubscription(value: unknown): SubscriptionInput | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as { endpoint?: unknown; keys?: unknown };
  const endpoint = parseEndpoint(data.endpoint);
  if (!endpoint || typeof data.keys !== "object" || data.keys === null) return null;
  const { p256dh, auth } = data.keys as { p256dh?: unknown; auth?: unknown };
  // A P-256 public key is 65 bytes and the secret 16: 87 and 22 characters, give or take padding.
  if (typeof p256dh !== "string" || !BASE64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return null;
  if (typeof auth !== "string" || !BASE64URL.test(auth) || auth.length < 16 || auth.length > 40) return null;
  return { endpoint, p256dh, auth };
}

export type DeliveryStatus = "sent" | "failed" | "expired";

/**
 * What a push service's answer means.
 *
 *   sent      accepted (2xx). The service will deliver it when the device is
 *             reachable; whether it was shown is never reported back.
 *   expired   404 or 410: the subscription is gone for good (the app was
 *             removed, permission withdrawn, the browser reset). It is
 *             retired, and never tried again.
 *   failed    anything else - no answer, a busy service, a refused request.
 *             The subscription is KEPT: one bad moment, or a mistake in this
 *             site's own keys (401, 403), must not cost a person their device.
 */
export function classifyPushResult(statusCode: number | null): DeliveryStatus {
  if (statusCode !== null && statusCode >= 200 && statusCode < 300) return "sent";
  if (statusCode === 404 || statusCode === 410) return "expired";
  return "failed";
}

/** "Chrome on Windows": how a device reads in the delivery history, long after its subscription is gone. */
export function deviceLabel(userAgent: unknown): string {
  if (typeof userAgent !== "string" || userAgent.trim() === "") return "Unknown device";
  const browser = /Edg(e|A|iOS)?\//.test(userAgent)
    ? "Edge"
    : /OPR\/|OPiOS/.test(userAgent)
      ? "Opera"
      : /SamsungBrowser/.test(userAgent)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(userAgent)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(userAgent)
            ? "Chrome"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : null;
  const system = /iPhone|iPod/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /CrOS/.test(userAgent)
            ? "ChromeOS"
            : /Macintosh|Mac OS X/.test(userAgent)
              ? "Mac"
              : /Linux/.test(userAgent)
                ? "Linux"
                : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

// ---------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------

/**
 * How push stands on THIS browser or installed app - the device's side of
 * things, which the site's own settings can never override:
 *
 *   not-set-up     the site has no push keys (VAPID): nothing can be sent
 *   needs-install  an iPhone or iPad in a browser: Apple delivers push only
 *                  to the app on the Home Screen
 *   unsupported    the browser cannot do push at all
 *   denied         notifications are blocked for this site in the browser or
 *                  the operating system; only the person can unblock them
 *   off            possible, and not switched on here
 *   enabled        this device is registered to the signed-in person
 *   needs-repair   switched on here by this person, but the device is no
 *                  longer connected (signed out and back in, the browser
 *                  replaced its subscription, the site's keys changed): it
 *                  is reconnected without asking, and says so only if that
 *                  fails
 */
export type PushDeviceState = "not-set-up" | "needs-install" | "unsupported" | "denied" | "off" | "enabled" | "needs-repair";

export interface PushEnvironment {
  /** The site has a public push key. */
  configured: boolean;
  userAgent: string;
  maxTouchPoints: number;
  /** Running as the installed app. */
  standalone: boolean;
  /** Service workers, the Push API and notifications are all there. */
  supported: boolean;
  permission: "default" | "granted" | "denied";
  /** The browser holds a push subscription for this site. */
  subscribed: boolean;
  /** That subscription was made with the site's current key. */
  keyMatches: boolean;
  /** The signed-in person is who switched push on here. */
  mine: boolean;
  /** The server holds that subscription for the signed-in person. */
  registered: boolean;
}

export function pushDeviceState(env: PushEnvironment): PushDeviceState {
  if (!env.configured) return "not-set-up";
  // Before "unsupported": in an iPhone's browser the Push API is simply absent, and the reason is worth saying.
  if (isIosDevice(env.userAgent, env.maxTouchPoints) && !env.standalone) return "needs-install";
  if (!env.supported) return "unsupported";
  if (env.permission === "denied") return "denied";
  // Permission alone is not "on": someone else may have granted it here, or this person switched it off.
  if (env.permission !== "granted" || !env.mine) return "off";
  // Theirs, and allowed - so anything short of a live, registered subscription is a fault to mend, not a choice.
  return env.subscribed && env.registered && env.keyMatches ? "enabled" : "needs-repair";
}

/** A public push key (base64url) as the bytes PushManager.subscribe() takes. */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** A public push key: 65 bytes, as 87 base64url characters. */
export function isVapidPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{87}$/.test(value);
}
