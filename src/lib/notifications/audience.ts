/**
 * Who a notification is for.
 *
 * A feature names an audience; it never works out the people itself. One
 * place then turns the audience into people, from the same roles, role
 * permissions and individual exceptions that decide what each person may do
 * (src/lib/auth/permissions.ts).
 *
 * Prefer a permission: "everyone who may plan services" stays right when an
 * administrator creates a role of their own or changes what one allows. A
 * role is for the two that mean who someone IS in the ministry (Musician,
 * Song Leader) rather than what they may do.
 *
 * An audience decides who is TOLD, never who may see: the page a notification
 * leads to checks the person's permissions itself.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import {
  ADMIN_ROLE,
  MEMBER_ROLE,
  MUSICIAN_ROLE,
  SONG_LEADER_ROLE,
  resolvePermissions,
  type Permission,
  type PermissionOverride,
} from "@/lib/auth/permissions";

export type Audience =
  /** These people, by Clerk user ID. */
  | { kind: "users"; userIds: readonly string[] }
  /** Everyone with an account. */
  | { kind: "everyone" }
  /**
   * Everyone holding a permission. `explicit` leaves out people who hold it
   * only because the Administrator role holds everything - as the
   * availability board does: an administrator is not thereby a musician.
   */
  | { kind: "permission"; permission: Permission; explicit?: boolean }
  /** Everyone holding a role. */
  | { kind: "role"; role: string }
  /** Anyone in any of these. */
  | { kind: "any"; of: readonly Audience[] };

/** The audiences features are expected to use, by name. */
export const AUDIENCES = {
  everyone: { kind: "everyone" },
  /** The music ministry's participants: the people on the availability board. */
  musicTeam: { kind: "permission", permission: "view_availability", explicit: true },
  musicians: { kind: "role", role: MUSICIAN_ROLE },
  songLeaders: { kind: "role", role: SONG_LEADER_ROLE },
  /** Whoever plans the services (the Music Director). */
  planners: { kind: "permission", permission: "manage_service_plans" },
  /** Whoever reviews account requests. */
  accountManagers: { kind: "permission", permission: "manage_users" },
  /** Whoever looks after the sheet music. */
  sheetMusicManagers: { kind: "permission", permission: "manage_sheet_music" },
  /** Whoever may use AI, and so may hear about it. */
  aiUsers: { kind: "permission", permission: "use_ai" },
  administrators: { kind: "role", role: ADMIN_ROLE },
} as const satisfies Record<string, Audience>;

/** One person, or a few. */
export function users(...userIds: string[]): Audience {
  return { kind: "users", userIds };
}

/** Everything that decides who holds what, for one Clerk environment. */
export interface Directory {
  userRoles: ReadonlyMap<string, readonly string[]>;
  rolePermissions: ReadonlyMap<string, readonly string[]>;
  overrides: ReadonlyMap<string, readonly PermissionOverride[]>;
  /**
   * Every account's ID. Only needed for an audience that can include someone
   * with no role and no exception (see needsEveryAccount); empty otherwise.
   */
  accountIds: readonly string[];
}

/**
 * Whether resolving this audience needs the list of every account: it does
 * when people the site holds no row for - Member-only accounts - can be in
 * it. That list comes from Clerk, so it is only fetched when it matters.
 */
export function needsEveryAccount(audience: Audience, rolePermissions: ReadonlyMap<string, readonly string[]>): boolean {
  switch (audience.kind) {
    case "everyone":
      return true;
    case "role":
      return audience.role === MEMBER_ROLE;
    case "permission":
      return (rolePermissions.get(MEMBER_ROLE) ?? []).includes(audience.permission);
    case "any":
      return audience.of.some((part) => needsEveryAccount(part, rolePermissions));
    default:
      return false;
  }
}

function matches(audience: Audience, userId: string, directory: Directory): boolean {
  switch (audience.kind) {
    case "users":
      return audience.userIds.includes(userId);
    case "everyone":
      return true;
    case "role":
      return audience.role === MEMBER_ROLE || (directory.userRoles.get(userId) ?? []).includes(audience.role);
    case "permission": {
      const roles = directory.userRoles.get(userId) ?? [];
      const counted = audience.explicit ? roles.filter((role) => role !== ADMIN_ROLE) : roles;
      return resolvePermissions(counted, directory.rolePermissions, directory.overrides.get(userId) ?? []).has(audience.permission);
    }
    case "any":
      return audience.of.some((part) => matches(part, userId, directory));
  }
}

function named(audience: Audience): string[] {
  if (audience.kind === "users") return [...audience.userIds];
  return audience.kind === "any" ? audience.of.flatMap(named) : [];
}

/**
 * The people in an audience, each once, without anyone in `except` (the
 * person who caused the event, say).
 */
export function resolveAudience(audience: Audience, directory: Directory, except: readonly string[] = []): string[] {
  const candidates = new Set([
    ...directory.userRoles.keys(),
    ...directory.overrides.keys(),
    ...directory.accountIds,
    ...named(audience),
  ]);
  const left = new Set(except);
  return [...candidates].filter((userId) => userId !== "" && !left.has(userId) && matches(audience, userId, directory));
}
