import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";

import { notifySafely, type NotifyInput } from "./service";
import { notificationDeps } from "./store";

/**
 * How a feature tells people something happened:
 *
 *   await notifyBestEffort(viewer.env, servicePlanPublished({ ... }));
 *
 * after its own change has been saved. What to say and to whom is built by
 * the feature's file in events/ (null when the change deserves no
 * notification); this adds the database for the Clerk environment and makes
 * sure a notification that fails never fails the change: it is logged, and
 * nothing is thrown (notifySafely in service.ts).
 */
export function notifyBestEffort(env: ClerkEnv, input: NotifyInput | null): Promise<void> {
  return notifySafely(input, notificationDeps(env));
}
