import "server-only";

import { runActivation, type ActivationResult } from "./activation-run";
import { listAccounts } from "./clerk";
import type { ClerkEnv } from "./clerk-env";
import {
  countBaselines,
  createPolicyOnce,
  loadAllAuthorization,
  patchPolicy,
  writeSnapshotPage,
} from "./requirements-store";

/** Activates (or finishes activating) profile requirements in this environment. See activation-run.ts. */
export function activateProfileRequirements(env: ClerkEnv, actor: string): Promise<ActivationResult> {
  return runActivation({
    createPolicyOnce: () => createPolicyOnce(env, actor),
    loadAuthorization: () => loadAllAuthorization(env),
    async listAccounts(offset, limit) {
      const result = await listAccounts({ limit, offset, order: "oldest" });
      if (!result.ok) return null;
      return {
        accounts: result.value.accounts.map((account) => ({ id: account.id, createdAt: account.createdAt })),
        total: result.value.total,
      };
    },
    writePage: (entries) => writeSnapshotPage(env, entries),
    countBaselines: (ids) => countBaselines(env, ids),
    markComplete: (accounts, at) => patchPolicy(env, { snapshot: "complete", snapshotCompletedAt: at, snapshotAccounts: accounts }, actor),
    now: () => Date.now(),
  });
}
