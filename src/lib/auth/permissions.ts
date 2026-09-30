/**
 * What a signed-in person may do on the site.
 *
 * Permissions are defined here, in code, because each one corresponds to a
 * check somewhere in the code: a permission nothing checks would do nothing.
 * A new feature adds its permission here and checks it with requirePermission().
 *
 * Roles are data. The site starts with the roles in DEFAULT_ROLES, and
 * administrators can then change which permissions each role has, and create
 * roles of their own, from /admin/roles. Individual people can also be given
 * exceptions (grant or deny one permission) on top of their roles.
 *
 * Pure - no server-only import - so it can be unit tested and shared with forms.
 */

import { ADMIN_ROLE_ROW } from "./schema.mjs";

export const PERMISSION_GROUPS = [
  { key: "administration", label: "Administration" },
  { key: "music", label: "Music ministry" },
  { key: "members", label: "Members" },
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number]["key"];

export const PERMISSIONS = {
  manage_users: {
    label: "Manage users",
    description: "Review account requests, send invitations, disable and delete accounts.",
    group: "administration",
  },
  manage_roles: {
    label: "Manage roles",
    description: "Create roles, change their permissions and assign them to people.",
    group: "administration",
  },
  view_profiles: {
    label: "View profiles",
    description: "See everyone's profile: instruments, music reading, availability and contact details.",
    group: "administration",
  },
  manage_profiles: {
    label: "Manage profiles",
    description: "Assign titles and manage the lists of titles and instruments.",
    group: "administration",
  },
  manage_site_settings: {
    label: "Manage site settings",
    description: "Change site-wide settings.",
    group: "administration",
  },
  manage_songs: {
    label: "Manage songs",
    description: "Edit songs and their details.",
    group: "music",
  },
  manage_service_plans: {
    label: "Manage service plans",
    description: "Plan the songs for each service.",
    group: "music",
  },
  manage_sheet_music: {
    label: "Manage sheet music",
    description: "Add and change sheet music.",
    group: "music",
  },
  view_analytics: {
    label: "View analytics",
    description: "See song statistics and reports.",
    group: "music",
  },
  view_service_plans: {
    label: "View service plans",
    description: "See upcoming service plans before they are public.",
    group: "members",
  },
  view_sheet_music: {
    label: "View member sheet music",
    description: "Open sheet music that is not available publicly.",
    group: "members",
  },
  view_member_resources: {
    label: "View member resources",
    description: "Open resources shared with members.",
    group: "members",
  },
} as const satisfies Record<string, { label: string; description: string; group: PermissionGroup }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/** Permissions that open the admin area. Anyone holding one sees the Admin link. */
export const ADMIN_PERMISSIONS: Permission[] = ["manage_users", "manage_roles", "view_profiles", "manage_profiles"];

/** The role that always holds every permission and cannot be edited or deleted. */
export const ADMIN_ROLE = ADMIN_ROLE_ROW.key;
/** The role every signed-in person holds without it being assigned. */
export const MEMBER_ROLE = "member";

/** Roles with special meaning in code (they drive profile sections). */
export const MUSICIAN_ROLE = "musician";
export const SONG_LEADER_ROLE = "song_leader";

export interface RoleSeed {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
}

/**
 * The roles the site starts with. They are written to the database once, the
 * first time accounts are used; after that the database is the source of
 * truth and edits made in /admin/roles are never overwritten.
 */
export const DEFAULT_ROLES: RoleSeed[] = [
  { ...ADMIN_ROLE_ROW, permissions: ALL_PERMISSIONS },
  {
    key: "music_director",
    label: "Music Director",
    description: "Leads the music ministry: songs, service plans, sheet music and reports.",
    permissions: [
      "manage_songs",
      "manage_service_plans",
      "manage_sheet_music",
      "view_analytics",
      "view_service_plans",
      "view_sheet_music",
      "view_member_resources",
    ],
  },
  {
    key: SONG_LEADER_ROLE,
    label: "Song Leader",
    description: "Leads congregational singing.",
    permissions: ["view_service_plans", "view_member_resources"],
  },
  {
    key: MUSICIAN_ROLE,
    label: "Musician",
    description: "Plays in services.",
    permissions: ["view_service_plans", "view_sheet_music", "view_member_resources"],
  },
  {
    key: MEMBER_ROLE,
    label: "Member",
    description: "Everyone with an account. Held automatically.",
    permissions: ["view_member_resources"],
  },
];

/** Role keys are lowercase words joined by underscores, e.g. "assistant_director". */
export function roleKeyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export type OverrideEffect = "grant" | "deny";

export interface PermissionOverride {
  permission: string;
  effect: OverrideEffect;
}

/**
 * Effective permissions for one person:
 *
 *   every permission of every role they hold (Member always included;
 *   Administrator always meaning all of them)
 *   + individual grants
 *   - individual denies
 *
 * Unknown permission keys (say, from a permission that was since removed from
 * the code) are ignored rather than trusted.
 */
export function resolvePermissions(
  roleKeys: readonly string[],
  rolePermissions: ReadonlyMap<string, readonly string[]>,
  overrides: readonly PermissionOverride[] = [],
): Set<Permission> {
  const result = new Set<Permission>();
  const roles = new Set([...roleKeys, MEMBER_ROLE]);

  for (const role of roles) {
    const granted = role === ADMIN_ROLE ? ALL_PERMISSIONS : (rolePermissions.get(role) ?? []);
    for (const permission of granted) if (isPermission(permission)) result.add(permission);
  }

  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    if (override.effect === "grant") result.add(override.permission);
  }
  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    // An administrator can never be locked out of managing users and roles:
    // otherwise one careless exception could leave nobody able to undo it.
    if (roles.has(ADMIN_ROLE) && (override.permission === "manage_users" || override.permission === "manage_roles")) {
      continue;
    }
    if (override.effect === "deny") result.delete(override.permission);
  }

  return result;
}

export function canAccessAdmin(permissions: ReadonlySet<Permission>): boolean {
  return ADMIN_PERMISSIONS.some((permission) => permissions.has(permission));
}
