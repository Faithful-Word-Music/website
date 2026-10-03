/**
 * The signed-in person's permissions as last seen in this browser, so the
 * navigation can show the links they open (the Service Planner,
 * Availability, Admin) at once on the next visit instead of after Clerk and
 * /api/account/me have both answered. The fresh answer always replaces it.
 *
 * Only a convenience for what to SHOW - every page checks again on the
 * server. Tied to one user id, so it never carries over to another account.
 *
 * Pure - no browser or server import - so it can be unit tested.
 */

import { isPermission, type Permission } from "./permissions";

export const NAV_CACHE_KEY = "fwm:nav-permissions";

export interface CachedNav {
  userId: string;
  permissions: Permission[];
}

export function serializeCachedNav(value: CachedNav): string {
  return JSON.stringify({ userId: value.userId, permissions: [...value.permissions].sort() });
}

/** The stored value, or null if there is none or it is not one we wrote. */
export function parseCachedNav(raw: string | null): CachedNav | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { userId?: unknown; permissions?: unknown };
    if (typeof value?.userId !== "string" || !value.userId || !Array.isArray(value.permissions)) return null;
    return {
      userId: value.userId,
      permissions: value.permissions.filter((item): item is Permission => typeof item === "string" && isPermission(item)),
    };
  } catch {
    return null;
  }
}
