/**
 * The events the site can notify people about: THE list.
 *
 * A feature emits an event by its key (notify() in service.ts); what the key
 * means - which category it is filed under, how much it matters, where it
 * leads when nothing more specific is given, and whether repeats of it fold
 * into one - is written here, once, rather than at each place that emits it.
 *
 * What each event says and who hears it is built in events/ (one file per
 * feature); NOTIFICATIONS.md lists them all with their audiences.
 *
 * FOLDING (`coalesce`): events that share a `family` and are about the same
 * entity replace one another while the earlier notification is still unread
 * and younger than `windowMinutes`. So five quick corrections to one
 * published service are one notification, and a published service edited
 * and then returned to draft shows only the latest of the two. An event
 * with no `coalesce` always adds a notification.
 *
 * Pure - no server-only import.
 */

import { COALESCE_MINUTES, type NotificationPriority } from "./model";

export interface NotificationEventDefinition {
  /** The category it is filed under: a key in notification_categories. */
  category: string;
  priority: NotificationPriority;
  /** Where it leads when the event gives no address of its own. */
  actionUrl?: string;
  /** Folds into an unread notification of the same family about the same entity. */
  coalesce?: { family: string; windowMinutes: number };
}

const within = (family: string, windowMinutes: number = COALESCE_MINUTES) => ({ family, windowMinutes });

export const NOTIFICATION_EVENTS = {
  /** Admin -> Notifications -> "Send me a test notification" (development only). */
  "system.test": { category: "ai_system", priority: "normal", actionUrl: "/notifications" },

  /** One publication: a service, or several published together. */
  "service_plan.published": { category: "service_plan_published", priority: "normal", actionUrl: "/song-list" },
  /** A published service's songs, keys or time changed. */
  "service_plan.updated": {
    category: "service_plan_updated",
    priority: "normal",
    actionUrl: "/song-list",
    coalesce: within("service_plan.change"),
  },
  /** A published service went back to draft, by hand or because its week's insert changed. */
  "service_plan.withdrawn": {
    category: "service_plan_updated",
    priority: "important",
    actionUrl: "/song-list",
    coalesce: within("service_plan.change"),
  },
  "service_plan.cancelled": {
    category: "service_plan_updated",
    priority: "important",
    actionUrl: "/song-list",
    coalesce: within("service_plan.status"),
  },
  "service_plan.restored": {
    category: "service_plan_updated",
    priority: "important",
    actionUrl: "/song-list",
    coalesce: within("service_plan.status"),
  },

  /** One service: available, unavailable, or back to normal. */
  "availability.service_changed": {
    category: "availability_changed",
    priority: "normal",
    actionUrl: "/availability",
    coalesce: within("availability.service"),
  },
  /** A date range entered at once: one absence, however many services it covers. */
  "availability.range_changed": {
    category: "availability_changed",
    priority: "normal",
    actionUrl: "/availability",
    coalesce: within("availability.range"),
  },
  /** The services someone usually serves at. */
  "availability.normal_changed": {
    category: "availability_changed",
    priority: "normal",
    actionUrl: "/availability",
    coalesce: within("availability.normal"),
  },

  /** Someone asked for an account. */
  "account.request_created": { category: "account_access", priority: "important", actionUrl: "/admin/requests" },
  /** Someone's roles or individual permissions were changed by someone else. */
  "account.access_changed": {
    category: "account_access",
    priority: "important",
    actionUrl: "/profile",
    coalesce: within("account.access"),
  },

  /** A refresh of the library index left song files it could not read. */
  "ai.library_index_problem": {
    category: "ai_system",
    priority: "important",
    actionUrl: "/admin/ai",
    coalesce: within("ai.library_index", 24 * 60),
  },
} as const satisfies Record<string, NotificationEventDefinition>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

export function isNotificationEvent(value: unknown): value is NotificationEventKey {
  return typeof value === "string" && Object.hasOwn(NOTIFICATION_EVENTS, value);
}
