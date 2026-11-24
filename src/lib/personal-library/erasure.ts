/**
 * The order of an account erasure. Pure orchestration over injected steps, so
 * every failure path is tested (docs/personal-library.md).
 *
 * The rules:
 *   - The marker goes down before Clerk is asked, and closes the library to writes.
 *   - It is removed only after a definitive refusal, and only when no other
 *     attempt might still succeed. Finding the account still there is not
 *     proof: an earlier request with an unknown result could yet delete it.
 *   - It is marked complete only after EVERY cleanup step has succeeded.
 *   - Every step can be repeated, so overlapping runs cannot do harm.
 */

export type ClerkDeletion = "deleted" | "refused" | "uncertain";

export interface ErasureCleanup {
  purgeLibrary(): Promise<void>;
  deleteUserData(): Promise<void>;
  deleteNotificationData(): Promise<void>;
  complete(): Promise<void>;
}

export interface ErasureDeps extends ErasureCleanup {
  /** False when the Personal Library tables do not exist here, so it holds nothing. */
  begin(attempt: string): Promise<boolean>;
  newAttempt(): string;
  deleteClerkAccount(): Promise<ClerkDeletion>;
  release(attempt: string): Promise<void>;
}

export type ErasureOutcome = "erased" | "refused" | "uncertain" | "cleanup-pending";

/** Every step, in order. Throws at the first failure, leaving the marker pending. */
export async function runErasureCleanup(steps: ErasureCleanup, marked: boolean): Promise<void> {
  if (marked) await steps.purgeLibrary();
  await steps.deleteUserData();
  await steps.deleteNotificationData();
  if (marked) await steps.complete();
}

/** `accountExists` is false when Clerk has already said this account is gone. */
export async function eraseAccount(deps: ErasureDeps, accountExists: boolean): Promise<ErasureOutcome> {
  const attempt = deps.newAttempt();
  // If this throws, nothing has been asked of Clerk and nothing has changed.
  const marked = await deps.begin(attempt);

  if (accountExists) {
    let result: ClerkDeletion;
    try {
      result = await deps.deleteClerkAccount();
    } catch {
      result = "uncertain";
    }
    if (result === "uncertain") return "uncertain";
    if (result === "refused") {
      if (marked) {
        // If this fails the marker stays. That is the safe direction.
        await deps.release(attempt).catch(() => undefined);
      }
      return "refused";
    }
  }

  try {
    await runErasureCleanup(deps, marked);
  } catch {
    return "cleanup-pending";
  }
  return "erased";
}

export interface RecoveryDeps {
  listPending(limit: number): Promise<string[]>;
  /** Whether Clerk says this account is gone. null when Clerk cannot answer. */
  accountGone(userId: string): Promise<boolean | null>;
  cleanupFor(userId: string): ErasureCleanup;
  noteTried(userId: string): Promise<void>;
}

export interface RecoverySummary {
  checked: number;
  completed: number;
  /** The Clerk account still exists: left pending, closed to writes. */
  waiting: number;
  failed: number;
}

/**
 * Finishes erasures whose Clerk account is confirmed gone. Never purges an
 * account Clerk still has or cannot answer for. Bounded by `limit`.
 */
export async function recoverPendingErasures(deps: RecoveryDeps, limit: number): Promise<RecoverySummary> {
  const pending = await deps.listPending(limit);
  const summary: RecoverySummary = { checked: pending.length, completed: 0, waiting: 0, failed: 0 };
  for (const userId of pending) {
    try {
      await deps.noteTried(userId);
      const gone = await deps.accountGone(userId);
      if (gone !== true) {
        if (gone === false) summary.waiting += 1;
        else summary.failed += 1;
        continue;
      }
      await runErasureCleanup(deps.cleanupFor(userId), true);
      summary.completed += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
