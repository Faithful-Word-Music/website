import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

import type { ClerkEnv } from "./clerk-env";
import type { Permission } from "./permissions";
import {
  applicableRequirements,
  missingRequirements,
  participation,
  planDeadlines,
  profileStatus,
  unknownStatus,
  type ProfileStatus,
} from "./profile-requirements";
import { loadRequirementRecord, recordDeadlines } from "./requirements-store";

/**
 * The server side of profile requirements (profile-requirements.ts holds
 * every rule). Reads one person's record in one round trip, records any
 * deadline that is due to exist, and returns their status. Never throws: if
 * anything is unavailable the answer is "unknown", which blocks nothing.
 */

export interface AccountFacts {
  firstName: string | null;
  lastName: string | null;
  /** When Clerk created the account (ms). Decides whether someone joined before the policy. */
  createdAt: number | null;
}

/** One person's status, for anyone: the viewer themself, or a person on their admin page. */
export async function evaluateProfile(
  env: ClerkEnv,
  userId: string,
  input: {
    roleKeys: readonly string[];
    explicit: ReadonlySet<Permission>;
    account: AccountFacts | null;
    now?: number;
    /**
     * False to look without recording anything (an administrator viewing
     * someone): planned deadlines are shown as they would be, nothing is
     * written, so looking never starts anyone's clock.
     */
    record?: boolean;
  },
): Promise<ProfileStatus> {
  const now = input.now ?? Date.now();
  const who = participation({ roleKeys: input.roleKeys, explicit: input.explicit });
  const applicable = applicableRequirements(who);
  const record = await loadRequirementRecord(env, userId);
  const missing = missingRequirements(applicable, {
    firstName: input.account?.firstName ?? null,
    lastName: input.account?.lastName ?? null,
    instruments: record.instruments,
    learningStyle: record.learningStyle,
    readsSheetMusic: record.readsSheetMusic,
    availabilityReviewedAt: record.availabilityReviewedAt,
    leading: record.leading,
  });

  let deadlines = record.deadlines;
  const plan = planDeadlines({
    policy: record.policy,
    applicable,
    existing: deadlines,
    hasBaseline: record.hasBaseline,
    accountCreatedAt: input.account?.createdAt ?? null,
    now,
  });
  if (input.record === false) {
    deadlines = new Map([...deadlines, ...plan.deadlines.map((item) => [item.key, item.dueAt] as const)]);
  } else if (plan.deadlines.length > 0 || plan.establishBaseline) {
    const source = record.policy && (input.account?.createdAt ?? now) < Date.parse(record.policy.activatedAt) ? "snapshot" : "first_seen";
    deadlines = await recordDeadlines(env, userId, plan.deadlines, plan.establishBaseline ? source : null);
  }

  // Account age unknown and nothing recorded yet: say what is missing, block nothing.
  if (record.policy && !record.hasBaseline && !plan.establishBaseline && missing.length > 0) {
    return { ...profileStatus({ policy: null, participation: who, applicable, missing, deadlines, now }), state: "grace" };
  }
  return profileStatus({ policy: record.policy, participation: who, applicable, missing, deadlines, now });
}

/**
 * The signed-in person's status, once per request. Their names and the
 * account's age come from Clerk (currentUser(), itself one call per request).
 */
export const getViewerProfileStatus = cache(
  async (viewer: { env: ClerkEnv; userId: string; roleKeys: readonly string[]; explicit: ReadonlySet<Permission> }): Promise<ProfileStatus> => {
    try {
      const user = await currentUser().catch(() => null);
      const account: AccountFacts | null = user
        ? { firstName: user.firstName, lastName: user.lastName, createdAt: user.createdAt }
        : null;
      return await evaluateProfile(viewer.env, viewer.userId, { roleKeys: viewer.roleKeys, explicit: viewer.explicit, account });
    } catch (error) {
      console.error("[profile] Could not work out the profile status:", error instanceof Error ? error.message : "unknown error");
      return unknownStatus();
    }
  },
);
