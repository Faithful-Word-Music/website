import "server-only";

import { normalizeEmail } from "./request-status";
import type { Viewer } from "./session";
import { activateRequestsFor } from "./store";

/**
 * Closes the account request that led to this account ("invited" becomes
 * "active"). Run on the pages a new member can land on after accepting an
 * invitation - the Dashboard, where sign-up ends, and their Profile. It is a
 * single UPDATE that changes nothing once the request is closed.
 */
export async function activateOwnRequests(viewer: Viewer, emails: readonly string[]): Promise<void> {
  await activateRequestsFor(viewer.env, emails.map(normalizeEmail));
}
