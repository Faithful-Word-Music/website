/**
 * The events the site can notify people about: THE list.
 *
 * A feature emits an event by its key (notify() in service.ts); what the key
 * means - which category it is filed under, how much it matters, where it
 * leads when nothing more specific is given - is written here, once, rather
 * than at each place that emits it.
 *
 * Phase 1 has no product events yet: only the test notification an
 * administrator can send themselves in development. Phase 2 adds an entry
 * for each real event (a service plan published, an account request, an
 * index that failed…) as it wires that feature in.
 *
 * Pure - no server-only import.
 */

import type { NotificationPriority } from "./model";

export interface NotificationEventDefinition {
  /** The category it is filed under: a key in notification_categories. */
  category: string;
  priority: NotificationPriority;
  /** Where it leads when the event gives no address of its own. */
  actionUrl?: string;
}

export const NOTIFICATION_EVENTS = {
  /** Admin -> Notifications -> "Send me a test notification" (development only). */
  "system.test": { category: "ai_system", priority: "normal", actionUrl: "/notifications" },
} as const satisfies Record<string, NotificationEventDefinition>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

export function isNotificationEvent(value: unknown): value is NotificationEventKey {
  return typeof value === "string" && Object.hasOwn(NOTIFICATION_EVENTS, value);
}
