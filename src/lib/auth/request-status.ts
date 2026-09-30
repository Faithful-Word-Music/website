/**
 * The life of an account request.
 *
 *   pending  -> someone asked; waiting for an administrator (can wait forever)
 *   invited  -> approved; Clerk has emailed an invitation
 *   active   -> the invitation was accepted and the account exists
 *   rejected -> an administrator declined it
 *   revoked  -> the invitation was withdrawn before it was used
 *   expired  -> the invitation ran out before it was used
 *
 * Clerk owns the invitation, so "invited" is brought up to date from Clerk's
 * invitation status (see reconcileRequests in store.ts) rather than guessed.
 */

export const REQUEST_STATUSES = ["pending", "invited", "active", "rejected", "revoked", "expired"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  active: "Active",
  rejected: "Rejected",
  revoked: "Invitation revoked",
  expired: "Invitation expired",
};

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** What an "invited" request becomes, given its Clerk invitation's status. */
export function statusFromInvitation(status: InvitationStatus | null): RequestStatus {
  switch (status) {
    case "accepted":
      return "active";
    case "revoked":
      return "revoked";
    case "expired":
      return "expired";
    default:
      // Still pending - or the invitation can no longer be found, which is not
      // enough to call it anything else.
      return "invited";
  }
}

/** Email addresses compare case-insensitively, ignoring surrounding spaces. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
