/**
 * Giving a new account what was decided for its invitation - only when the
 * account provably accepted that exact invitation.
 *
 * An invitation sent since the membership tables were installed carries a
 * decision ID in its Clerk metadata, which Clerk copies to the new user and
 * which the user cannot edit. An older invitation has no such link, so it can
 * give roles (never affiliation) only through one exact accepted invitation
 * to a verified address, with no newer one for that address.
 *
 * Anything that does not line up grants nothing and is left for an
 * administrator. If Clerk cannot be reached, nothing is granted or recorded,
 * so the next visit tries again. Pure orchestration over injected
 * dependencies, so every path is tested.
 */

/** The key in Clerk public metadata holding the decision ID. */
export const INVITATION_DECISION_KEY = "invitationDecisionId";

export interface ClaimDecision {
  id: string;
  email: string;
  status: "open" | "consumed" | "revoked" | "expired" | "superseded" | "review";
  invitationId: string | null;
  expiresAt: number;
}

export interface ClaimInvitation {
  id: string;
  /** Normalized. */
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: number;
}

export function decisionClaimable(input: {
  decision: ClaimDecision;
  invitation: ClaimInvitation | null;
  verifiedEmails: readonly string[];
  now: number;
}): boolean {
  const { decision, invitation, verifiedEmails, now } = input;
  return (
    decision.status === "open" &&
    decision.invitationId !== null &&
    decision.expiresAt > now &&
    verifiedEmails.includes(decision.email) &&
    invitation !== null &&
    invitation.id === decision.invitationId &&
    invitation.status === "accepted" &&
    invitation.email === decision.email
  );
}

export interface LegacyRow {
  invitationId: string;
  email: string;
}

/** The one older invitation this account can safely be said to have accepted, or null. */
export function legacyInvitationMatch(input: {
  rows: readonly LegacyRow[];
  invitations: readonly ClaimInvitation[];
  verifiedEmails: readonly string[];
  userCreatedAt: number;
}): string | null {
  const { rows, invitations, verifiedEmails, userCreatedAt } = input;
  const candidates = new Set(rows.filter((row) => verifiedEmails.includes(row.email)).map((row) => row.invitationId));
  if (candidates.size !== 1) return null;
  const [id] = candidates;
  const invitation = invitations.find((item) => item.id === id);
  if (!invitation || invitation.status !== "accepted" || !verifiedEmails.includes(invitation.email)) return null;
  if (invitation.createdAt > userCreatedAt) return null;
  const superseded = invitations.some((item) => item.email === invitation.email && item.createdAt > invitation.createdAt);
  return superseded ? null : invitation.id;
}

export interface ClaimDeps {
  /** Whether the membership tables exist here yet. */
  installed: boolean;
  now(): number;
  currentUser(): Promise<{ verifiedEmails: string[]; decisionId: string | null; createdAt: number } | null>;
  findDecision(id: string): Promise<ClaimDecision | null>;
  /** Every Clerk invitation for these addresses, or null when Clerk cannot answer. */
  invitationsFor(emails: readonly string[]): Promise<ClaimInvitation[] | null>;
  consumeDecision(id: string, invitationId: string): Promise<boolean>;
  legacyRows(emails: readonly string[]): Promise<LegacyRow[]>;
  applyLegacy(invitationId: string): Promise<number>;
  recordCheck(outcome: "claimed" | "none" | "review", decisionId: string | null): Promise<void>;
}

/** True when something was granted, so the caller reads the person's access again. */
export async function runInvitationClaim(deps: ClaimDeps): Promise<boolean> {
  const user = await deps.currentUser();
  if (!user) return false;
  const record = async (outcome: "claimed" | "none" | "review", decisionId: string | null) => {
    if (deps.installed) await deps.recordCheck(outcome, decisionId);
  };

  if (deps.installed && user.decisionId) {
    const decision = await deps.findDecision(user.decisionId);
    if (!decision) {
      await record("review", user.decisionId);
      return false;
    }
    const invitations = await deps.invitationsFor([decision.email]);
    if (!invitations) return false;
    const invitation = invitations.find((item) => item.id === decision.invitationId) ?? null;
    const valid = decisionClaimable({ decision, invitation, verifiedEmails: user.verifiedEmails, now: deps.now() });
    if (valid && (await deps.consumeDecision(decision.id, decision.invitationId!))) return true;
    await record("review", decision.id);
    return false;
  }

  const rows = await deps.legacyRows(user.verifiedEmails);
  if (rows.length === 0) {
    await record("none", null);
    return false;
  }
  const invitations = await deps.invitationsFor([...new Set(rows.map((row) => row.email))]);
  if (!invitations) return false;
  const match = legacyInvitationMatch({ rows, invitations, verifiedEmails: user.verifiedEmails, userCreatedAt: user.createdAt });
  if (!match) {
    await record("review", null);
    return false;
  }
  const applied = await deps.applyLegacy(match);
  await record("claimed", null);
  return applied > 0;
}
