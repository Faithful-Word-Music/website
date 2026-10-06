import "server-only";

import { getAccount } from "@/lib/auth/clerk";

/**
 * The names behind Clerk user IDs, for the AI's admin pages: who saved a
 * global memory, who changed the planning philosophy. Each distinct person is
 * looked up once; someone whose account is gone, or who cannot be looked up
 * just now, is simply left out and shown without a name.
 */
export async function namesOf(userIds: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
  const distinct = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id !== ""))];
  const found = await Promise.all(
    distinct.map(async (id) => {
      const account = await getAccount(id);
      return account.ok ? ([id, account.value.fullName] as const) : null;
    }),
  );
  return new Map(found.filter((item): item is readonly [string, string] => item !== null));
}
