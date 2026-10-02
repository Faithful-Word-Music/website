/**
 * Who availability is for, and whose availability someone may change.
 *
 * Availability belongs to the music ministry's active participants - by
 * default Musicians, Song Leaders and the Music Director - not to every
 * account. That is expressed with permissions, never role names:
 *
 *   view_availability    a participant: on the shared board, sees everyone's
 *                        changes, and keeps their own normal services and
 *                        exceptions.
 *   manage_availability  a leader: may also change anyone else's on the board.
 *
 * The board (the roster) is everyone who holds view_availability through a
 * role's permissions or an individual grant, minus individual denies. The
 * Administrator role's blanket "every permission" lets an administrator open
 * and manage the board, but does not list them on it as a musician: someone
 * is a participant only when a role or grant says so on purpose.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import {
  ADMIN_ROLE,
  resolvePermissions,
  type Permission,
  type PermissionOverride,
} from "@/lib/auth/permissions";

export const PARTICIPANT_PERMISSION = "view_availability" satisfies Permission;
export const LEADER_PERMISSION = "manage_availability" satisfies Permission;

/** Whether one person is on the availability board. */
export function isAvailabilityParticipant(
  roleKeys: readonly string[],
  rolePermissions: ReadonlyMap<string, readonly string[]>,
  overrides: readonly PermissionOverride[] = [],
): boolean {
  // Everything but the Administrator role's implicit "all permissions".
  const roles = roleKeys.filter((key) => key !== ADMIN_ROLE);
  return resolvePermissions(roles, rolePermissions, overrides).has(PARTICIPANT_PERMISSION);
}

/**
 * Everyone on the board, from every person's roles and individual
 * permission exceptions. Someone with neither holds only Member - which by
 * design is not a participant - so they are not looked at.
 */
export function availabilityRosterIds(
  userRoles: ReadonlyMap<string, readonly string[]>,
  rolePermissions: ReadonlyMap<string, readonly string[]>,
  overrides: ReadonlyMap<string, readonly PermissionOverride[]>,
): string[] {
  const ids = new Set([...userRoles.keys(), ...overrides.keys()]);
  return [...ids].filter((id) => isAvailabilityParticipant(userRoles.get(id) ?? [], rolePermissions, overrides.get(id) ?? []));
}

export type AvailabilityTarget =
  | { kind: "self"; userId: string }
  | { kind: "other"; userId: string }
  | { kind: "forbidden"; reason: "not-on-board" | "not-a-leader" | "unknown-person" };

/**
 * Whose availability a change is for.
 *
 *   - No person named (or the viewer's own ID): the viewer themself - always
 *     taken from the session, never from what the browser sent. They must be
 *     on the board; changing a pattern nobody would ever see is refused.
 *   - Someone else: only with manage_availability, and only someone on the
 *     board.
 */
export function availabilityTarget(
  viewer: { userId: string; can(permission: Permission): boolean },
  requestedUserId: string | null | undefined,
  rosterIds: ReadonlySet<string>,
): AvailabilityTarget {
  if (!requestedUserId || requestedUserId === viewer.userId) {
    return rosterIds.has(viewer.userId)
      ? { kind: "self", userId: viewer.userId }
      : { kind: "forbidden", reason: "not-on-board" };
  }
  if (!viewer.can(LEADER_PERMISSION)) return { kind: "forbidden", reason: "not-a-leader" };
  if (!rosterIds.has(requestedUserId)) return { kind: "forbidden", reason: "unknown-person" };
  return { kind: "other", userId: requestedUserId };
}

/** A service can be changed until it starts; after that it is history. */
export function isEditable(occurrence: { startsAt: string }, now: number): boolean {
  return Date.parse(occurrence.startsAt) > now;
}
