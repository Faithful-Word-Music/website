/**
 * An announcement: a message someone wrote and sent from Admin ->
 * Notifications (manual.ts, manual-service.ts).
 *
 * Unlike every other event, the person who caused it IS told when the
 * audience includes them: they chose to say this to those people, themselves
 * among them, and receiving it is how they see it arrived. So there is no
 * `except` here.
 *
 * Each announcement is about itself - a fresh id - so two are never taken
 * for one, in the app or on a device.
 *
 * Pure - no server-only import.
 */

import type { Audience } from "../audience";
import { ANNOUNCEMENT_ENTITY, ANNOUNCEMENT_EVENT } from "../manual";
import type { NotificationPriority } from "../model";
import type { NotifyInput } from "../service";

export function adminAnnouncement(input: {
  actorId: string;
  /** A fresh id for this one send. */
  id: string;
  title: string;
  body: string;
  /** Where it leads, or null for nowhere: an announcement has no page of its own. */
  actionUrl: string | null;
  priority: NotificationPriority;
  audience: Audience;
  /** What to keep with the event, given how many people were told. */
  snapshot: (told: { recipients: number }) => Record<string, unknown>;
}): NotifyInput {
  return {
    event: ANNOUNCEMENT_EVENT,
    audience: input.audience,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl,
    priority: input.priority,
    actorUserId: input.actorId,
    entity: { type: ANNOUNCEMENT_ENTITY, id: input.id },
    payload: input.snapshot,
  };
}
