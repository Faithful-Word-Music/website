import type { ClerkEnv } from "./clerk-env";
import type { ClaimDecision } from "./invitation-claim";

/**
 * Church affiliation and invitation decisions (membership-schema.mjs).
 *
 * Every function takes its query client, because these tables exist only
 * after the owner has installed them: nothing here runs on first use. Each
 * change and its audit row are written together, or not at all.
 */

type Row = Record<string, unknown>;

export interface MembershipSql {
  query(text: string, params?: unknown[]): Promise<Row[]>;
  transaction(statements: Array<{ text: string; params: unknown[] }>): Promise<Row[][]>;
}

export type AffiliationStatus = "verified" | "revoked";

export interface Affiliation {
  status: AffiliationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  note: string;
}

const AFFILIATION_COLUMNS = `clerk_user_id, status, verified_by, verified_at, updated_by, updated_at, note`;

const iso = (value: unknown): string => new Date(value as string | Date).toISOString();

function toAffiliation(row: Row): Affiliation {
  return {
    status: row.status as AffiliationStatus,
    verifiedBy: (row.verified_by as string | null) ?? null,
    verifiedAt: row.verified_at ? iso(row.verified_at) : null,
    updatedBy: row.updated_by as string,
    updatedAt: iso(row.updated_at),
    note: row.note as string,
  };
}

/** One account's record, or null: no record means unverified. */
export async function getAffiliation(sql: MembershipSql, env: ClerkEnv, userId: string): Promise<Affiliation | null> {
  const [row] = await sql.query(
    `SELECT ${AFFILIATION_COLUMNS} FROM user_church_affiliations WHERE clerk_env = $1 AND clerk_user_id = $2`,
    [env, userId],
  );
  return row ? toAffiliation(row) : null;
}

/** Records for many accounts in one query (for the user list). Accounts with none are left out. */
export async function affiliationsForUsers(
  sql: MembershipSql,
  env: ClerkEnv,
  userIds: readonly string[],
): Promise<Map<string, Affiliation>> {
  if (userIds.length === 0) return new Map();
  const rows = await sql.query(
    `SELECT ${AFFILIATION_COLUMNS} FROM user_church_affiliations WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
    [env, userIds],
  );
  return new Map(rows.map((row) => [row.clerk_user_id as string, toAffiliation(row)]));
}

export interface AffiliationChange {
  env: ClerkEnv;
  userId: string;
  /** The status the administrator was looking at; null for no record. */
  expected: AffiliationStatus | null;
  next: AffiliationStatus;
  actor: string;
  reason: string;
}

export type AffiliationChangeResult =
  | { ok: true; status: AffiliationStatus }
  | { ok: false; problem: "conflict" | "unchanged"; current: AffiliationStatus | null };

/**
 * Verifies or revokes, only if the record is still what the administrator
 * saw, so two people acting at once cannot overwrite each other. One
 * statement: the change and its audit row commit together.
 */
export async function changeAffiliation(sql: MembershipSql, change: AffiliationChange): Promise<AffiliationChangeResult> {
  const { env, userId, expected, next, actor, reason } = change;
  if (expected === next) {
    const current = (await getAffiliation(sql, env, userId))?.status ?? null;
    return { ok: false, problem: current === next ? "unchanged" : "conflict", current };
  }

  const saved = await sql.query(
    `WITH prior AS (
       SELECT status FROM user_church_affiliations
        WHERE clerk_env = $1 AND clerk_user_id = $2
        FOR UPDATE
     ), saved AS (
       INSERT INTO user_church_affiliations AS current
              (clerk_env, clerk_user_id, status, verified_by, verified_at, updated_by, updated_at)
       SELECT $1::text, $2::text, $4::text,
              CASE WHEN $4::text = 'verified' THEN $5::text END,
              CASE WHEN $4::text = 'verified' THEN now() END,
              $5::text, now()
        WHERE (SELECT status FROM prior) IS NOT DISTINCT FROM $3::text
       ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE
          SET status = EXCLUDED.status,
              verified_by = COALESCE(EXCLUDED.verified_by, current.verified_by),
              verified_at = COALESCE(EXCLUDED.verified_at, current.verified_at),
              updated_by = EXCLUDED.updated_by,
              updated_at = now()
        WHERE current.status IS NOT DISTINCT FROM $3::text
       RETURNING status
     ), logged AS (
       INSERT INTO membership_audit_log
              (clerk_env, target_user_id, action, prior_status, new_status, actor_user_id, reason)
       SELECT $1::text, $2::text, 'affiliation_' || status, $3::text, status, $5::text, $6::text FROM saved
     )
     SELECT status FROM saved`,
    [env, userId, expected, next, actor, reason],
  );
  if (saved.length === 1) return { ok: true, status: next };
  return { ok: false, problem: "conflict", current: (await getAffiliation(sql, env, userId))?.status ?? null };
}

export interface NewInvitationDecision {
  id: string;
  env: ClerkEnv;
  /** Already normalized (normalizeEmail). */
  email: string;
  verifyAffiliation: boolean;
  roleKeys: readonly string[];
  accountRequestId: number | null;
  actor: string;
  expiresAt: Date;
}

/**
 * Records what was decided for a new invitation, retiring any earlier open
 * decision for the address in the same transaction. A superseded decision
 * can never be consumed.
 */
export async function createInvitationDecision(sql: MembershipSql, decision: NewInvitationDecision): Promise<void> {
  const { id, env, email, verifyAffiliation, roleKeys, accountRequestId, actor, expiresAt } = decision;
  await sql.transaction([
    {
      text: `WITH retired AS (
               UPDATE invitation_decisions SET status = 'superseded'
                WHERE clerk_env = $1 AND email_normalized = $2 AND status = 'open'
                RETURNING id, clerk_invitation_id, account_request_id
             )
             INSERT INTO membership_audit_log
                    (clerk_env, action, prior_status, new_status, actor_user_id, account_request_id, clerk_invitation_id, decision_id)
             SELECT $1, 'decision_superseded', 'open', 'superseded', $3, account_request_id, clerk_invitation_id, id FROM retired`,
      params: [env, email, actor],
    },
    {
      text: `WITH made AS (
               INSERT INTO invitation_decisions
                      (id, clerk_env, email_normalized, account_request_id, verify_affiliation, role_keys, created_by, expires_at)
               VALUES ($1, $2, $3, $4::integer, $5, $6::text[], $7, $8::timestamptz)
               RETURNING id, account_request_id
             )
             INSERT INTO membership_audit_log
                    (clerk_env, action, new_status, actor_user_id, account_request_id, decision_id)
             SELECT $2, 'decision_created', 'open', $7, account_request_id, id FROM made`,
      params: [id, env, email, accountRequestId, verifyAffiliation, [...roleKeys], actor, expiresAt.toISOString()],
    },
  ]);
}

/** Ties an open decision to the Clerk invitation created for it. Only ever once. */
export async function bindDecisionInvitation(
  sql: MembershipSql,
  env: ClerkEnv,
  id: string,
  invitationId: string,
): Promise<boolean> {
  const rows = await sql.query(
    `WITH bound AS (
       UPDATE invitation_decisions SET clerk_invitation_id = $3
        WHERE clerk_env = $1 AND id = $2 AND status = 'open' AND clerk_invitation_id IS NULL
        RETURNING id, created_by, account_request_id
     ), logged AS (
       INSERT INTO membership_audit_log
              (clerk_env, action, prior_status, new_status, actor_user_id, account_request_id, clerk_invitation_id, decision_id)
       SELECT $1, 'decision_bound', 'open', 'open', created_by, account_request_id, $3, id FROM bound
     )
     SELECT id FROM bound`,
    [env, id, invitationId],
  );
  return rows.length === 1;
}

/** A decision as the invitation claim needs it, or null. */
export async function decisionForClaim(sql: MembershipSql, env: ClerkEnv, id: string): Promise<ClaimDecision | null> {
  const [row] = await sql.query(
    `SELECT id, email_normalized, status, clerk_invitation_id, expires_at
       FROM invitation_decisions WHERE clerk_env = $1 AND id = $2`,
    [env, id],
  );
  if (!row) return null;
  return {
    id: row.id as string,
    email: row.email_normalized as string,
    status: row.status as ClaimDecision["status"],
    invitationId: (row.clerk_invitation_id as string | null) ?? null,
    expiresAt: new Date(row.expires_at as string | Date).getTime(),
  };
}

/**
 * Uses a decision, once: its roles, affiliation, audit rows and claim record
 * in one statement. Re-checks that it is open, unexpired and bound to this
 * invitation. An existing affiliation record, a revoked one above all, is
 * never overwritten; a role deleted since is skipped.
 */
export async function consumeDecision(
  sql: MembershipSql,
  claim: { env: ClerkEnv; id: string; invitationId: string; userId: string },
): Promise<boolean> {
  const rows = await sql.query(
    `WITH claimed AS (
       UPDATE invitation_decisions
          SET status = 'consumed', consumed_by = $4, consumed_at = now()
        WHERE clerk_env = $1 AND id = $2 AND status = 'open'
          AND clerk_invitation_id = $3 AND expires_at > now()
        RETURNING id, clerk_env, role_keys, verify_affiliation, created_by, account_request_id, clerk_invitation_id
     ), granted AS (
       INSERT INTO user_roles (clerk_env, clerk_user_id, role_key, granted_by)
       SELECT c.clerk_env, $4, r.key, c.created_by
         FROM claimed c JOIN roles r ON r.clerk_env = c.clerk_env AND r.key = ANY(c.role_keys)
       ON CONFLICT DO NOTHING
     ), affiliated AS (
       INSERT INTO user_church_affiliations (clerk_env, clerk_user_id, status, verified_by, verified_at, updated_by)
       SELECT c.clerk_env, $4, 'verified', c.created_by, now(), c.created_by FROM claimed c WHERE c.verify_affiliation
       ON CONFLICT DO NOTHING
       RETURNING clerk_user_id
     ), checked AS (
       INSERT INTO invitation_claim_checks (clerk_env, clerk_user_id, outcome, decision_id)
       SELECT c.clerk_env, $4, 'claimed', c.id FROM claimed c
       ON CONFLICT (clerk_env, clerk_user_id)
       DO UPDATE SET outcome = 'claimed', decision_id = EXCLUDED.decision_id, checked_at = now()
     ), logged AS (
       INSERT INTO membership_audit_log
              (clerk_env, target_user_id, action, prior_status, new_status, actor_user_id, account_request_id, clerk_invitation_id, decision_id)
       SELECT c.clerk_env, $4, 'decision_consumed', 'open', 'consumed', c.created_by, c.account_request_id, c.clerk_invitation_id, c.id
         FROM claimed c
       UNION ALL
       SELECT c.clerk_env, $4, 'affiliation_verified', NULL, 'verified', c.created_by, c.account_request_id, c.clerk_invitation_id, c.id
         FROM claimed c WHERE EXISTS (SELECT 1 FROM affiliated)
     )
     SELECT id FROM claimed`,
    [claim.env, claim.id, claim.invitationId, claim.userId],
  );
  return rows.length === 1;
}

/** Remembers that this account has been resolved, so ordinary requests do not ask Clerk again. */
export async function recordClaimCheck(
  sql: MembershipSql,
  check: { env: ClerkEnv; userId: string; outcome: "claimed" | "none" | "review"; decisionId: string | null },
): Promise<void> {
  await sql.query(
    `INSERT INTO invitation_claim_checks (clerk_env, clerk_user_id, outcome, decision_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_env, clerk_user_id)
     DO UPDATE SET outcome = EXCLUDED.outcome, decision_id = EXCLUDED.decision_id, checked_at = now()`,
    [check.env, check.userId, check.outcome, check.decisionId],
  );
}

/** Closes the open decision for a Clerk invitation, when one exists. */
export async function retireDecisionForInvitation(
  sql: MembershipSql,
  retirement: Omit<DecisionRetirement, "id"> & { invitationId: string },
): Promise<boolean> {
  const [row] = await sql.query(
    `SELECT id FROM invitation_decisions WHERE clerk_env = $1 AND clerk_invitation_id = $2 AND status = 'open'`,
    [retirement.env, retirement.invitationId],
  );
  if (!row) return false;
  const { env, status, actor, reason } = retirement;
  return retireDecision(sql, { env, status, actor, reason, id: row.id as string });
}

export interface DecisionRetirement {
  env: ClerkEnv;
  id: string;
  status: "revoked" | "expired" | "superseded" | "review";
  actor: string;
  reason: string;
}

/** Closes an open decision so it can never be consumed. False when it was not open. */
export async function retireDecision(sql: MembershipSql, retirement: DecisionRetirement): Promise<boolean> {
  const { env, id, status, actor, reason } = retirement;
  const rows = await sql.query(
    `WITH done AS (
       UPDATE invitation_decisions SET status = $3
        WHERE clerk_env = $1 AND id = $2 AND status = 'open'
        RETURNING id, clerk_invitation_id, account_request_id
     ), logged AS (
       INSERT INTO membership_audit_log
              (clerk_env, action, prior_status, new_status, actor_user_id, reason, account_request_id, clerk_invitation_id, decision_id)
       SELECT $1, 'decision_' || $3::text, 'open', $3, $4, $5, account_request_id, clerk_invitation_id, id FROM done
     )
     SELECT id FROM done`,
    [env, id, status, actor, reason],
  );
  return rows.length === 1;
}
