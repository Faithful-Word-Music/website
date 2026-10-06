/**
 * Notifications about accounts and access.
 *
 *   a new account request   -> whoever reviews them (manage_users). The
 *                              notification names nobody: the request's name
 *                              and address stay on the review page, behind
 *                              its own permission check. (The email to
 *                              administration is separate and unchanged.)
 *   someone's access        -> that person, once per save: a batch of roles
 *   changed by someone else    is one notification, not one per role
 *
 * Nothing else about accounts notifies: titles, sheet music, invitations,
 * disabling and deleting are administration, not news for the person. An
 * approved or declined request is answered by Clerk's own email - whoever
 * asked has no account to be notified in.
 *
 * Pure - no server-only import - so every rule here is unit tested.
 */

import { notificationsContent } from "@/content/notifications";

import { AUDIENCES, users } from "../audience";
import type { NotifyInput } from "../service";

const copy = notificationsContent.events.account;

/**
 * A request for an account was recorded. `request` is what recording it
 * returned (createRequest): one dropped because the address already has a
 * request waiting created nothing, and tells nobody again.
 */
export function accountRequestCreated(request: { created: true; id: number } | { created: false }): NotifyInput | null {
  if (!request.created) return null;
  return {
    event: "account.request_created",
    audience: AUDIENCES.accountManagers,
    ...copy.requestCreated,
    actionUrl: `/admin/requests/${request.id}`,
    entity: { type: "account-request", id: String(request.id) },
  };
}

/**
 * Someone's roles or individual permissions were changed. `changed` is
 * whether anything really was (saving the roles someone already holds is
 * not); a change someone made to their own access tells nobody.
 */
export function accountAccessChanged(input: { actorId: string; userId: string; changed: boolean }): NotifyInput | null {
  if (!input.changed || input.userId === input.actorId) return null;
  return {
    event: "account.access_changed",
    audience: users(input.userId),
    ...copy.accessChanged,
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: { type: "account", id: input.userId },
  };
}
