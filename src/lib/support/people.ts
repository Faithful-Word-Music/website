import "server-only";

import { listAccounts } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { needsEveryAccount, resolveAudience } from "@/lib/notifications/audience";
import { SUPPORT_MANAGERS } from "@/lib/notifications/events/support";
import { everyAccount, notificationDeps } from "@/lib/notifications/store";

/**
 * Names for the people a support page mentions, from Clerk. Fails soft: a
 * name that cannot be read is simply missing, and the page says "A former
 * member" rather than failing.
 */
export async function namesFor(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id) => id.startsWith("user_")))];
  if (ids.length === 0) return new Map();
  try {
    const accounts = await listAccounts({ userIds: ids, limit: 500, offset: 0 });
    if (!accounts.ok) return new Map();
    return new Map(accounts.value.accounts.map((account) => [account.id, account.fullName || account.email || ""]));
  } catch (error) {
    console.error("[support] Names could not be read:", error instanceof Error ? error.message : "unknown error");
    return new Map();
  }
}

/** Everyone who manages requests now, by name, for "Assigned to". Empty when it cannot be read. */
export async function supportManagers(env: ClerkEnv): Promise<Array<{ id: string; name: string }>> {
  try {
    const directory = await notificationDeps(env).loadDirectory();
    const ids = resolveAudience(
      SUPPORT_MANAGERS,
      needsEveryAccount(SUPPORT_MANAGERS, directory.rolePermissions)
        ? { ...directory, accountIds: (await everyAccount()).map((account) => account.id) }
        : directory,
    );
    const names = await namesFor(ids);
    return ids.map((id) => ({ id, name: names.get(id) || id })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("[support] Managers could not be read:", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}
