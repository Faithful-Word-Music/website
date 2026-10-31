/**
 * Activating profile requirements in one environment - resumable and
 * idempotent (docs/profile-requirements.md, "Activation").
 *
 *   1. The policy row is written once (ON CONFLICT DO NOTHING) and read
 *      back: its activatedAt is the one authoritative start, however many
 *      times or by however many people Activate is pressed.
 *   2. Every Clerk account is visited, oldest first (so accounts created
 *      meanwhile only ever join the end of the list), and each account that
 *      existed before activatedAt gets its baseline and a deadline of
 *      activatedAt + 7 days for every requirement that applies to it - all
 *      ON CONFLICT DO NOTHING, so nothing already recorded moves.
 *   3. The snapshot is checked: every account counted, and every account
 *      from before activation has its baseline.
 *   4. Only then is the snapshot marked complete - and only a complete
 *      snapshot lets the policy block anyone (isEnforcing()).
 *
 * Any failure leaves the snapshot "pending" (nobody blocked) and Activate
 * can simply be pressed again: it starts from step 1, which changes nothing,
 * and repeats steps 2-4, which change nothing already done.
 *
 * Pure orchestration over injected dependencies, so every path is tested.
 */

import { explicitPermissions, type PermissionOverride } from "./permissions";
import {
  applicableRequirements,
  participation,
  planDeadlines,
  type Deadline,
  type RequirementPolicy,
} from "./profile-requirements";

export const SNAPSHOT_PAGE = 100;
/** A runaway guard: no church has this many accounts. */
const MAX_PAGES = 200;

export interface ActivationDeps {
  createPolicyOnce(): Promise<RequirementPolicy>;
  loadAuthorization(): Promise<{
    userRoles: ReadonlyMap<string, readonly string[]>;
    rolePermissions: ReadonlyMap<string, readonly string[]>;
    overrides: ReadonlyMap<string, readonly PermissionOverride[]>;
  }>;
  /** One page of Clerk accounts, oldest first, with the total Clerk reports. */
  listAccounts(offset: number, limit: number): Promise<{ accounts: Array<{ id: string; createdAt: number }>; total: number } | null>;
  writePage(entries: Array<{ userId: string; deadlines: Deadline[] }>): Promise<void>;
  countBaselines(userIds: readonly string[]): Promise<number>;
  markComplete(accounts: number, at: string): Promise<RequirementPolicy | null>;
  now(): number;
}

export type ActivationResult =
  | { ok: true; policy: RequirementPolicy; accounts: number; alreadyComplete: boolean }
  | { ok: false; problem: "accounts-unavailable" | "incomplete" | "failed"; policy: RequirementPolicy | null };

export async function runActivation(deps: ActivationDeps): Promise<ActivationResult> {
  let policy: RequirementPolicy | null = null;
  try {
    policy = await deps.createPolicyOnce();
    if (policy.snapshot === "complete") {
      return { ok: true, policy, accounts: policy.snapshotAccounts ?? 0, alreadyComplete: true };
    }
    const activatedAt = Date.parse(policy.activatedAt);
    const { userRoles, rolePermissions, overrides } = await deps.loadAuthorization();

    const seen = new Set<string>();
    const existing: string[] = [];
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await deps.listAccounts(page * SNAPSHOT_PAGE, SNAPSHOT_PAGE);
      if (!result) return { ok: false, problem: "accounts-unavailable", policy };
      total = result.total;
      const entries: Array<{ userId: string; deadlines: Deadline[] }> = [];
      for (const account of result.accounts) {
        if (seen.has(account.id)) continue;
        seen.add(account.id);
        // Joined at or after activation: a new member, seen (and given no grace) on their first visit.
        if (account.createdAt >= activatedAt) continue;
        existing.push(account.id);
        const roleKeys = userRoles.get(account.id) ?? [];
        const who = participation({
          roleKeys,
          explicit: explicitPermissions(roleKeys, rolePermissions, overrides.get(account.id) ?? []),
        });
        const plan = planDeadlines({
          policy,
          applicable: applicableRequirements(who),
          existing: new Map(),
          hasBaseline: false,
          accountCreatedAt: account.createdAt,
          now: deps.now(),
        });
        entries.push({ userId: account.id, deadlines: plan.deadlines });
      }
      await deps.writePage(entries);
      if (result.accounts.length < SNAPSHOT_PAGE || seen.size >= total) break;
    }

    // Checked, not assumed: every account counted, and every one from before activation recorded.
    if (seen.size < total) return { ok: false, problem: "incomplete", policy };
    if ((await deps.countBaselines(existing)) !== existing.length) return { ok: false, problem: "incomplete", policy };

    const completed = await deps.markComplete(existing.length, new Date(deps.now()).toISOString());
    if (!completed || completed.snapshot !== "complete") return { ok: false, problem: "failed", policy: completed ?? policy };
    return { ok: true, policy: completed, accounts: existing.length, alreadyComplete: false };
  } catch (error) {
    console.error("[profile] Activation did not finish:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, problem: "failed", policy };
  }
}
