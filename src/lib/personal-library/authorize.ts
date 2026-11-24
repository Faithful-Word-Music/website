import "server-only";

import { withPermission, type ActionResult } from "@/lib/auth/session";

import type { LibraryOwner } from "./store";

/**
 * The boundary for every future Personal Library server action.
 *
 * An approved member is anyone with a valid session in this Clerk environment
 * whose profile is not overdue: the same check as the rest of the site. It
 * needs no role, affiliation or sheet music access, and it grants none.
 *
 * The owner comes only from the session, so a browser cannot name another
 * person or environment, and no permission reaches someone else's records.
 */
export function withPersonalLibrary<T>(action: (owner: LibraryOwner) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return withPermission<T>(null, (viewer) => action({ env: viewer.env, userId: viewer.userId }));
}
