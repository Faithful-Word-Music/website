/**
 * What a notification is, and the rule for whether one reaches a person.
 *
 * A notification is a durable record of something a person should know about.
 * It is NOT a push message: push, like email, is only one way of delivering
 * one. The three channels:
 *
 *   in_app   the bell in the header and the Notifications page
 *   push     the person's devices (a later phase)
 *   email    (a later phase)
 *
 * Every category has its own policy for each channel, set by whoever holds
 * manage_notifications (Admin -> Notifications) and kept in the database:
 *
 *   mandatory     on, and the person cannot turn it off here
 *   default_on    on unless the person turned it off
 *   default_off   off unless the person turned it on
 *   unavailable   not offered on that channel
 *
 * A person's own choices are stored only when they make one, and a policy
 * change never touches them: effectiveSetting() below puts the two together
 * every time it is asked. So a choice made under "default on" is simply
 * outranked while the category is mandatory, and counts again afterwards.
 *
 * Pure - no server-only import - so it is unit tested and shared with the
 * pages.
 */

import type { Permission } from "@/lib/auth/permissions";
import { isSitePath } from "@/lib/page-origin";

export const CHANNELS = ["in_app", "push", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const POLICIES = ["mandatory", "default_on", "default_off", "unavailable"] as const;
export type ChannelPolicy = (typeof POLICIES)[number];

export const PRIORITIES = ["normal", "important", "critical"] as const;
export type NotificationPriority = (typeof PRIORITIES)[number];

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}

export function isChannelPolicy(value: unknown): value is ChannelPolicy {
  return typeof value === "string" && (POLICIES as readonly string[]).includes(value);
}

export function isPriority(value: unknown): value is NotificationPriority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * How far along each channel is:
 *
 *   live      notifications are delivered on it now
 *   planned   its policies and people's choices are kept, for when it launches
 *   soon      not offered at all yet: nothing can be switched on
 *
 * Launching a channel is changing its entry here, with its delivery added in
 * service.ts - the policies and choices are already in place.
 */
export const CHANNEL_STATUS: Record<Channel, "live" | "planned" | "soon"> = {
  in_app: "live",
  push: "planned",
  email: "soon",
};

/**
 * Channels nobody is ever opted into: on only for a person who switched it on
 * themselves (or a mandatory category). When email launches, nobody starts
 * receiving it because a policy said "default on".
 */
const OPT_IN_ONLY: readonly Channel[] = ["email"];

/** The policies an administrator may choose for a channel. A channel not offered yet has only "unavailable". */
export function allowedPolicies(channel: Channel): readonly ChannelPolicy[] {
  if (CHANNEL_STATUS[channel] === "soon") return ["unavailable"];
  if (OPT_IN_ONLY.includes(channel)) return ["mandatory", "default_off", "unavailable"];
  return POLICIES;
}

export interface EffectiveSetting {
  /** Whether this category reaches the person on this channel. */
  enabled: boolean;
  /** The person cannot change it: mandatory, or not offered. */
  locked: boolean;
  /** Whether the channel is offered for this category at all. */
  available: boolean;
}

/**
 * THE rule: a category's policy for a channel, and the person's own stored
 * choice (null when they never made one), as what actually happens.
 */
export function effectiveSetting(channel: Channel, policy: ChannelPolicy, stored: boolean | null): EffectiveSetting {
  if (policy === "unavailable" || CHANNEL_STATUS[channel] === "soon") return { enabled: false, locked: true, available: false };
  if (policy === "mandatory") return { enabled: true, locked: true, available: true };
  const fallback = policy === "default_on" && !OPT_IN_ONLY.includes(channel);
  return { enabled: stored ?? fallback, locked: false, available: true };
}

export interface NotificationCategory {
  /** The stable identifier code uses. Never changed once notifications exist under it. */
  key: string;
  name: string;
  description: string;
  /** A retired category is kept, so its history still reads, but nothing new is sent under it. */
  active: boolean;
  sortOrder: number;
}

export type CategoryPolicies = Record<Channel, ChannelPolicy>;

/**
 * The categories and policies a site starts with. Written to the database
 * once; after that the database is the source of truth, and what an
 * administrator changes is never put back. Nothing here makes a category
 * mandatory in code - it only starts that way.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<Omit<NotificationCategory, "active" | "sortOrder"> & { policies: CategoryPolicies }> = [
  {
    key: "admin_announcement",
    name: "Announcements",
    description: "Messages written and sent by the music ministry's leaders.",
    policies: { in_app: "mandatory", push: "mandatory", email: "unavailable" },
  },
  {
    key: "service_plan_published",
    name: "Service plan published",
    description: "The songs for upcoming services have been published.",
    policies: { in_app: "default_on", push: "default_on", email: "unavailable" },
  },
  {
    key: "service_plan_updated",
    name: "Service plan updated",
    description: "A published service plan has changed.",
    policies: { in_app: "default_on", push: "default_on", email: "unavailable" },
  },
  {
    key: "availability_changed",
    name: "Availability changes",
    description: "Someone's availability for a service has changed.",
    policies: { in_app: "default_on", push: "default_on", email: "unavailable" },
  },
  {
    key: "account_access",
    name: "Account and access",
    description: "Account requests, and changes to what your account can do.",
    policies: { in_app: "mandatory", push: "default_on", email: "unavailable" },
  },
  {
    key: "sheet_music_report",
    name: "Sheet music and reports",
    description: "Problems reported with sheet music, and what became of them.",
    policies: { in_app: "default_on", push: "default_off", email: "unavailable" },
  },
  {
    key: "ai_system",
    name: "AI and system",
    description: "Library indexing, AI budget warnings and other system events.",
    policies: { in_app: "default_on", push: "default_off", email: "unavailable" },
  },
];

/**
 * Which categories are worth showing in a person's notification settings:
 * a category listed here shows only to someone holding ANY of its
 * permissions - nothing in "AI and system" will ever reach a musician, so
 * they are not asked about it. A category with no entry (announcements,
 * account, sheet music, and any an administrator adds) shows to everyone.
 *
 * This is about what is worth ASKING, and nothing else. It is not who
 * receives an event (audience.ts), and it is never who may open a page:
 * a hidden category can still be chosen and still delivers.
 */
export const CATEGORY_RELEVANCE: Readonly<Record<string, readonly Permission[]>> = {
  service_plan_published: ["view_service_plans", "manage_service_plans"],
  service_plan_updated: ["view_service_plans", "manage_service_plans"],
  availability_changed: ["view_availability", "manage_availability"],
  ai_system: ["use_ai"],
};

/** Whether a category belongs in this person's notification settings. */
export function isRelevantCategory(categoryKey: string, can: (permission: Permission) => boolean): boolean {
  const permissions = Object.hasOwn(CATEGORY_RELEVANCE, categoryKey) ? CATEGORY_RELEVANCE[categoryKey] : null;
  return !permissions || permissions.some(can);
}

/**
 * How long related notifications fold into one, in minutes: a second change
 * to the same thing within this long of an UNREAD notification about it
 * replaces that notification instead of adding another (notify() in
 * service.ts). The library index folds for a day (catalog.ts).
 */
export const COALESCE_MINUTES = 15;

/** A notification as the person it is for sees it. Nothing of the event's payload is here. */
export interface NotificationItem {
  id: number;
  category: string;
  title: string;
  body: string;
  /** A page on this site, or null. Following it grants nothing: the page checks for itself. */
  actionUrl: string | null;
  priority: NotificationPriority;
  /** When it was read, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

export const NOTIFICATION_LIMITS = {
  titleChars: 120,
  bodyChars: 600,
  actionUrlChars: 500,
  /** How many the bell's panel shows. */
  recent: 8,
  /** A page of the history. */
  page: 20,
  maxPage: 50,
} as const;

const tidy = (value: string) => value.replace(/\s+/g, " ").trim();

/** A title: one tidy line within the limit, or null. */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = tidy(value);
  return text === "" || text.length > NOTIFICATION_LIMITS.titleChars ? null : text;
}

/** A body: may be empty; null only when it is not text or too long. */
export function normalizeBody(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > NOTIFICATION_LIMITS.bodyChars ? null : text;
}

/**
 * Where a notification leads: a page on this site, or nowhere (null). An
 * address anywhere else is refused (undefined) - a notification can never
 * send someone off the site.
 */
export function safeActionUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > NOTIFICATION_LIMITS.actionUrlChars) return undefined;
  return isSitePath(value) ? value : undefined;
}

/** The count on the bell: "99+" rather than a number too wide for it. Empty at zero. */
export function badgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}
