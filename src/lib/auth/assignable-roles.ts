import "server-only";

import { ADMIN_ROLE, MEMBER_ROLE, isPermission, type Permission } from "./permissions";
import type { Viewer } from "./session";
import { listRoles } from "./store";

/**
 * Whether this person may hand a permission on. Sheet music held only through
 * church affiliation is theirs alone: it never lets them give it to others.
 */
export function canDelegate(viewer: Pick<Viewer, "can" | "sheet">, permission: Permission): boolean {
  return permission === "view_sheet_music" ? viewer.sheet.delegable : viewer.can(permission);
}

/**
 * The roles this person may hand out when inviting someone, mirroring the
 * rules the server enforces (checkInvitationRoles in app/admin/actions.ts):
 * needs "Manage roles"; Administrator only for administrators; never a role
 * with permissions the viewer lacks. Member is left out - everyone has it.
 */
export async function assignableRoles(viewer: Viewer): Promise<Array<{ key: string; label: string }>> {
  if (!viewer.can("manage_roles")) return [];
  const isAdmin = viewer.roleKeys.includes(ADMIN_ROLE);
  return (await listRoles(viewer.env))
    .filter((role) => role.key !== MEMBER_ROLE)
    .filter((role) =>
      role.key === ADMIN_ROLE ? isAdmin : role.permissions.filter(isPermission).every((permission) => canDelegate(viewer, permission)),
    )
    .map(({ key, label }) => ({ key, label }));
}
