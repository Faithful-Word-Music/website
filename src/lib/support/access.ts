/**
 * Who may do what with a support request. Every server function asks here,
 * with the person from the session - never with anything the browser says
 * about who it is or what it may do.
 *
 *   manager    holds manage_support_requests: every request, every message
 *              including internal notes, and the workflow
 *   submitter  sent it and holds submit_support_requests: their own request,
 *              its public conversation, and replying
 *   none       anyone else - the request does not exist for them ("not found")
 *
 * Taking the permission away takes the access away at once: nothing is
 * remembered about who could see what.
 *
 * Pure - no server-only import.
 */

import type { Permission } from "@/lib/auth/permissions";

export const SUBMIT_PERMISSION = "submit_support_requests" satisfies Permission;
export const MANAGE_PERMISSION = "manage_support_requests" satisfies Permission;

export interface SupportActor {
  userId: string;
  can(permission: Permission): boolean;
}

export type SupportAccess = "manager" | "submitter" | "none";

export function supportAccess(actor: SupportActor, request: { submitterId: string }): SupportAccess {
  if (actor.can(MANAGE_PERMISSION)) return "manager";
  if (request.submitterId === actor.userId && actor.can(SUBMIT_PERMISSION)) return "submitter";
  return "none";
}

/** Whether the person may use the Support Center at all. */
export function usesSupport(actor: Pick<SupportActor, "can">): boolean {
  return actor.can(SUBMIT_PERMISSION) || actor.can(MANAGE_PERMISSION);
}

/** Which messages a reader is shown. Internal notes are for managers alone. */
export function visibleMessages<T extends { visibility: "public" | "internal" }>(access: SupportAccess, messages: readonly T[]): T[] {
  if (access === "manager") return [...messages];
  if (access === "submitter") return messages.filter((message) => message.visibility === "public");
  return [];
}

/**
 * Which history events a reader is shown. A submitter sees what became of
 * their request (status, resolution, reopening), not the management's
 * housekeeping (assignment, priority, internal notes).
 */
export function visibleEvents<T extends { kind: string; visibility: "public" | "internal" }>(access: SupportAccess, events: readonly T[]): T[] {
  if (access === "manager") return [...events];
  if (access !== "submitter") return [];
  return events.filter(
    (event) => event.visibility === "public" && ["created", "status_changed", "resolved", "closed", "reopened"].includes(event.kind),
  );
}
