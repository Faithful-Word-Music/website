import "server-only";

import type { ClerkEnv } from "./clerk-env";
import { listInvitations } from "./clerk";
import { statusFromInvitation } from "./request-status";
import { setRequestStatuses, type AccountRequest } from "./store";

/**
 * Brings "invited" requests up to date with their Clerk invitations
 * (accepted -> active, revoked, expired). Called when the requests are viewed,
 * so no webhook is needed. If Clerk cannot be reached the requests are shown
 * as they were.
 */
export async function reconcileRequests(env: ClerkEnv, requests: AccountRequest[]): Promise<AccountRequest[]> {
  const invited = requests.filter((request) => request.status === "invited" && request.clerkInvitationId);
  if (invited.length === 0) return requests;

  const invitations = await listInvitations({ limit: 500 });
  if (!invitations.ok) return requests;
  const byId = new Map(invitations.value.map((invitation) => [invitation.id, invitation.status]));

  const updates = invited
    .map((request) => ({ id: request.id, status: statusFromInvitation(byId.get(request.clerkInvitationId!) ?? null) }))
    .filter((update) => update.status !== "invited");
  if (updates.length === 0) return requests;

  await setRequestStatuses(env, updates);
  const next = new Map(updates.map((update) => [update.id, update.status]));
  return requests.map((request) => (next.has(request.id) ? { ...request, status: next.get(request.id)! } : request));
}
