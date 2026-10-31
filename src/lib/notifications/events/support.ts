/**
 * What the Support Center tells people (docs/support-center.md), built from
 * one recorded support event and the request it belongs to.
 *
 *   created                       -> whoever manages requests
 *   assigned (to someone else)    -> the new assignee
 *   a manager's public reply      -> the submitter: a reply, a request for
 *                                    more information, or a resolution
 *   the submitter's reply         -> the assignee, or every manager when
 *                                    nobody has it
 *   resolved / reopened / closed  -> the submitter (a manager's change)
 *
 * Internal notes, priority, assignment housekeeping and "in progress" tell
 * nobody. Whoever did it is never told. Nothing anyone wrote is ever in a
 * notification - only the request's ID and its kind - because one can be
 * read on a lock screen or in an inbox. (The one exception, by email to the
 * submitter alone, is supportAcknowledgment below.)
 *
 * Every notice carries the dedupe key `support:<event id>`: telling the same
 * event again (a retry, the daily drain) tells nobody twice.
 *
 * Pure.
 */

import { notificationsContent } from "@/content/notifications";
import { supportContent } from "@/content/support";
import { resolvePermissions, type Permission } from "@/lib/auth/permissions";
import { requestHref, type Category, type Status, type WorkflowEventKind } from "@/lib/support/model";

import { users, type Audience, type Directory } from "../audience";
import type { NotifyInput } from "../service";
import { fill } from "./text";

const copy = notificationsContent.events.support;

/** Everyone who manages requests: a role, an individual grant, or the Administrator role. */
export const SUPPORT_MANAGERS: Audience = { kind: "permission", permission: "manage_support_requests" };

export interface SupportEventFacts {
  event: { id: string; kind: WorkflowEventKind; actorId: string | null; from: string | null; to: string | null; visibility: "public" | "internal" };
  request: { publicId: string; submitterId: string; assigneeId: string | null; category: Category };
}

export function supportNotice({ event, request }: SupportEventFacts): NotifyInput | null {
  if (event.visibility !== "public" && event.kind !== "assigned") return null;
  const kind = supportContent.categories[request.category];
  const body = fill(copy.body, { id: request.publicId, kind });
  const base = {
    body,
    actionUrl: requestHref(request.publicId),
    actorUserId: event.actorId,
    except: event.actorId ? [event.actorId] : [],
    entity: { type: "support_request", id: request.publicId },
    dedupeKey: `support:${event.id}`,
    whenCoalesced: { body: `${body}. ${copy.several}` },
  };
  const toSubmitter = users(request.submitterId);
  const toHandlers = request.assigneeId ? users(request.assigneeId) : SUPPORT_MANAGERS;

  switch (event.kind) {
    case "created":
      return { ...base, event: "support.request_created", audience: SUPPORT_MANAGERS, title: copy.created.title };
    case "assigned":
      return event.to ? { ...base, event: "support.request_assigned", audience: users(event.to), title: copy.assigned.title } : null;
    case "resolved":
      return { ...base, event: "support.request_resolved", audience: toSubmitter, title: copy.resolved.title };
    case "reopened":
      return { ...base, event: "support.status_changed", audience: toSubmitter, title: copy.reopened.title };
    case "closed":
      return { ...base, event: "support.status_changed", audience: toSubmitter, title: copy.closed.title };
    case "replied":
      if (event.from === "submitter") {
        return {
          ...base,
          event: "support.submitter_replied",
          audience: toHandlers,
          title: event.to === "reopen" ? copy.submitterReopened.title : copy.submitterReplied.title,
        };
      }
      if (event.to === "internal") return null;
      if (event.to === "request_info") return { ...base, event: "support.info_requested", audience: toSubmitter, title: copy.infoRequested.title };
      if (event.to === "resolve") {
        return {
          ...base,
          event: "support.request_resolved",
          audience: toSubmitter,
          title: copy.resolved.title,
          body: fill(copy.resolved.withReply, { id: request.publicId, kind }),
        };
      }
      return { ...base, event: "support.manager_replied", audience: toSubmitter, title: copy.managerReplied.title };
    default:
      return null;
  }
}

export interface SupportAcknowledgmentFacts {
  event: SupportEventFacts["event"];
  request: SupportEventFacts["request"] & { title: string; status: Status };
}

/**
 * The submitter's acknowledgment that their request arrived: one per request,
 * from its "created" event only. A reply, a reopening or any other later
 * change never makes another, and a resent submission records no new event.
 *
 * The one deliberate exception to two rules above:
 *   - it goes to the person who acted, because it is about what they did;
 *   - it carries words a person wrote: the summary they gave it. It goes
 *     only to them, at their own verified address, and only by email (its
 *     category has no in-app or push), so it is never on a lock screen and
 *     is never shown to anyone else. Its details are never included.
 *
 * Its own dedupe key (`support:<event id>:ack`), so it is recorded once
 * beside the managers' notice of the same event, however often it is told.
 */
export function supportAcknowledgment({ event, request }: SupportAcknowledgmentFacts): NotifyInput | null {
  if (event.kind !== "created") return null;
  const wording = copy.received;
  return {
    event: "support.request_received",
    audience: users(request.submitterId),
    title: wording.title,
    body: fill(wording.body, { title: request.title, id: request.publicId, status: supportContent.statuses[request.status] }),
    actionUrl: requestHref(request.publicId),
    actorUserId: event.actorId,
    entity: { type: "support_request", id: request.publicId },
    dedupeKey: `support:${event.id}:ack`,
  };
}

/** Whether someone holds a permission now, from the same tables everyone's access is read from. */
function holds(directory: Directory, userId: string, permission: Permission): boolean {
  const roles = directory.userRoles.get(userId) ?? [];
  const overrides = directory.overrides.get(userId) ?? [];
  return resolvePermissions(roles, directory.rolePermissions, overrides).has(permission);
}

/**
 * Who is told, checked again when it is told: a submitter who can no longer
 * use the Support Center is not told about it, an assignment to someone who
 * no longer manages requests tells nobody, and a reply meant for such an
 * assignee goes to the managers instead.
 */
export function currentAudience(notice: NotifyInput, directory: Directory, request: { submitterId: string }): NotifyInput | null {
  if (notice.audience.kind !== "users") return notice;
  const [userId] = notice.audience.userIds;
  if (userId === request.submitterId) {
    return holds(directory, userId, "submit_support_requests") || holds(directory, userId, "manage_support_requests") ? notice : null;
  }
  if (holds(directory, userId, "manage_support_requests")) return notice;
  return notice.event === "support.submitter_replied" ? { ...notice, audience: SUPPORT_MANAGERS } : null;
}
