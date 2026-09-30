"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createInvitation,
  deleteAccount,
  getAccount,
  revokeInvitation,
  setBanned,
  type ClerkResult,
} from "@/lib/auth/clerk";
import {
  clerkInvitationIdSchema,
  clerkUserIdSchema,
  firstIssue,
  inviteSchema,
  optionLabelSchema,
  overrideSchema,
  reviewNoteSchema,
  roleSchema,
} from "@/lib/auth/forms";
import { ADMIN_ROLE, isPermission, roleKeyFromLabel, type Permission } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/request-status";
import { siteOrigin, withPermission, type ActionResult, type Viewer } from "@/lib/auth/session";
import {
  addOption,
  assignRole,
  claimRequestForApproval,
  createRole,
  deleteRole,
  deleteUserData,
  getRole,
  loadAuthorization,
  markInvitationRevoked,
  moveOption,
  recordRequestInvitation,
  rejectRequest,
  releaseRequestClaim,
  removeOverride,
  removeRole,
  renameOption,
  setOptionArchived,
  setOverride,
  setUserTitles,
  updateRole,
  type OptionList,
} from "@/lib/auth/store";

/**
 * Every change made from the admin area. Server actions are public POST
 * endpoints, so each one:
 *
 *   1. goes through withPermission() - a verified Clerk session, resolved to
 *      this site's roles, holding the named permission;
 *   2. validates every argument (IDs included) before using it;
 *   3. applies the rules below that stop anyone raising their own access.
 *
 * Nothing here trusts what the admin pages chose to show.
 */

const isAdmin = (viewer: Viewer) => viewer.roleKeys.includes(ADMIN_ROLE);

/**
 * Nobody may give out a permission they do not hold themselves - otherwise
 * someone with "Manage roles" could grant themselves anything. Administrators
 * hold every permission, so this never limits them.
 */
function exceedsOwn(viewer: Viewer, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => !viewer.can(permission));
}

/** Changes to someone who is an administrator can only be made by an administrator. */
async function targetIsProtectedFrom(viewer: Viewer, targetId: string): Promise<boolean> {
  if (isAdmin(viewer)) return false;
  const target = await loadAuthorization(viewer.env, targetId);
  return target.roleKeys.includes(ADMIN_ROLE);
}

function clerkError(result: Extract<ClerkResult<unknown>, { ok: false }>, fallback: string): { ok: false; error: string } {
  switch (result.reason) {
    case "rate-limited":
      return { ok: false, error: "Clerk is limiting requests right now. Please wait a few minutes and try again." };
    case "not-found":
      return { ok: false, error: "That account or invitation no longer exists in Clerk." };
    case "already-exists":
      return { ok: false, error: result.message ?? "That already exists in Clerk." };
    default:
      return { ok: false, error: fallback };
  }
}

function parseId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Account requests
// ---------------------------------------------------------------------------

/**
 * Approves a request: claim it (so it can only be approved once), send the
 * Clerk invitation, then record which invitation it was. If Clerk refuses,
 * the claim is released and the request is pending again - the database and
 * Clerk never disagree about whether an invitation went out.
 */
export async function approveRequestAction(id: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const requestId = parseId(id);
    if (!requestId) return { ok: false, error: "Unknown request." };

    const request = await claimRequestForApproval(viewer.env, requestId, viewer.userId);
    if (!request) return { ok: false, error: "This request has already been reviewed." };

    const invitation = await createInvitation(normalizeEmail(request.email), `${await siteOrigin()}/accept-invite`);
    if (!invitation.ok) {
      await releaseRequestClaim(viewer.env, requestId);
      return clerkError(invitation, "The invitation could not be sent. The request is still pending - please try again.");
    }

    await recordRequestInvitation(viewer.env, requestId, invitation.value.id);
    revalidatePath("/admin", "layout");
    return { ok: true, value: null, message: `Invitation sent to ${request.email}.` };
  });
}

export async function rejectRequestAction(id: unknown, note: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const requestId = parseId(id);
    if (!requestId) return { ok: false, error: "Unknown request." };
    const parsedNote = reviewNoteSchema.safeParse(note ?? "");
    if (!parsedNote.success) return { ok: false, error: firstIssue(parsedNote.error) };

    const done = await rejectRequest(viewer.env, requestId, viewer.userId, parsedNote.data);
    if (!done) return { ok: false, error: "This request has already been reviewed." };
    revalidatePath("/admin", "layout");
    return { ok: true, value: null, message: "Request declined. Nothing was sent to the person." };
  });
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function inviteAction(email: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async () => {
    const parsed = inviteSchema.safeParse({ email });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const invitation = await createInvitation(normalizeEmail(parsed.data.email), `${await siteOrigin()}/accept-invite`);
    if (!invitation.ok) {
      if (invitation.reason === "already-exists") {
        return { ok: false, error: "That address already has an account or a pending invitation." };
      }
      return clerkError(invitation, "The invitation could not be sent. Please try again.");
    }
    revalidatePath("/admin", "layout");
    return { ok: true, value: null, message: `Invitation sent to ${invitation.value.email}.` };
  });
}

export async function revokeInvitationAction(invitationId: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const parsed = clerkInvitationIdSchema.safeParse(invitationId);
    if (!parsed.success) return { ok: false, error: "Unknown invitation." };

    const revoked = await revokeInvitation(parsed.data);
    if (!revoked.ok) return clerkError(revoked, "The invitation could not be revoked. Please try again.");
    await markInvitationRevoked(viewer.env, parsed.data);
    revalidatePath("/admin", "layout");
    return { ok: true, value: null, message: "Invitation revoked. Its link no longer works." };
  });
}

// ---------------------------------------------------------------------------
// People: roles, exceptions, titles, access
// ---------------------------------------------------------------------------

export async function setUserRoleAction(userId: unknown, roleKey: unknown, assigned: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success || typeof roleKey !== "string" || typeof assigned !== "boolean") {
      return { ok: false, error: "Unknown person or role." };
    }
    // Your own roles: only an administrator may change them - they already
    // hold every permission, so no role can raise them further - and never
    // the Administrator role itself, so nobody can lock themselves out.
    if (target.data === viewer.userId) {
      if (!isAdmin(viewer)) {
        return { ok: false, error: "You cannot change your own roles. Ask an administrator." };
      }
      if (roleKey === ADMIN_ROLE) {
        return { ok: false, error: "You cannot remove your own Administrator role. Ask another administrator." };
      }
    }
    const role = await getRole(viewer.env, roleKey);
    if (!role) return { ok: false, error: "That role no longer exists." };
    if (roleKey === ADMIN_ROLE && !isAdmin(viewer)) {
      return { ok: false, error: "Only administrators can give or remove the Administrator role." };
    }
    const rolePermissions = role.permissions.filter(isPermission);
    if (assigned && exceedsOwn(viewer, rolePermissions)) {
      return { ok: false, error: "That role includes permissions you do not have yourself." };
    }
    if (await targetIsProtectedFrom(viewer, target.data)) {
      return { ok: false, error: "Only administrators can change an administrator's roles." };
    }

    if (assigned) {
      await assignRole(viewer.env, target.data, roleKey, viewer.userId);
    } else if ((await removeRole(viewer.env, target.data, roleKey)) === "last-admin") {
      return { ok: false, error: "This is the only administrator. Make someone else an administrator first." };
    }
    revalidatePath(`/admin/users/${target.data}`);
    return { ok: true, value: null, message: assigned ? `Added ${role.label}.` : `Removed ${role.label}.` };
  });
}

export async function setOverrideAction(userId: unknown, input: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    const parsed = overrideSchema.safeParse(input);
    if (!target.success) return { ok: false, error: "Unknown person." };
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if (target.data === viewer.userId) {
      return { ok: false, error: "You cannot change your own permissions. Ask another administrator." };
    }
    const permission = parsed.data.permission as Permission;
    if (parsed.data.effect === "grant" && exceedsOwn(viewer, [permission])) {
      return { ok: false, error: "You cannot grant a permission you do not have yourself." };
    }
    if (await targetIsProtectedFrom(viewer, target.data)) {
      return { ok: false, error: "Only administrators can change an administrator's permissions." };
    }

    await setOverride(viewer.env, target.data, { ...parsed.data, permission }, viewer.userId);
    revalidatePath(`/admin/users/${target.data}`);
    return { ok: true, value: null, message: "Exception saved." };
  });
}

export async function removeOverrideAction(userId: unknown, permission: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success || typeof permission !== "string") return { ok: false, error: "Unknown exception." };
    if (target.data === viewer.userId) {
      return { ok: false, error: "You cannot change your own permissions. Ask another administrator." };
    }
    if (await targetIsProtectedFrom(viewer, target.data)) {
      return { ok: false, error: "Only administrators can change an administrator's permissions." };
    }
    await removeOverride(viewer.env, target.data, permission);
    revalidatePath(`/admin/users/${target.data}`);
    return { ok: true, value: null, message: "Exception removed." };
  });
}

export async function setTitlesAction(userId: unknown, titleIds: unknown, primaryId: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success) return { ok: false, error: "Unknown person." };
    if (!Array.isArray(titleIds) || titleIds.length > 20 || !titleIds.every((id) => parseId(id))) {
      return { ok: false, error: "Unknown title." };
    }
    const primary = primaryId === null ? null : parseId(primaryId);
    await setUserTitles(viewer.env, target.data, titleIds as number[], primary, viewer.userId);
    revalidatePath(`/admin/users/${target.data}`);
    return { ok: true, value: null, message: "Titles saved." };
  });
}

/** Banning signs the person out everywhere and blocks sign-in until unbanned. */
export async function setBannedAction(userId: unknown, banned: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success || typeof banned !== "boolean") return { ok: false, error: "Unknown person." };
    if (target.data === viewer.userId) return { ok: false, error: "You cannot disable your own account." };
    if (await targetIsProtectedFrom(viewer, target.data)) {
      return { ok: false, error: "Only administrators can disable an administrator." };
    }

    const result = await setBanned(target.data, banned);
    if (!result.ok) return clerkError(result, "The account could not be updated. Please try again.");
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      value: null,
      message: banned ? "Account disabled. They have been signed out everywhere." : "Account re-enabled.",
    };
  });
}

/**
 * Deletes the Clerk account, then everything this site holds about the
 * person. If the site's part fails after Clerk's succeeded, the leftover rows
 * are harmless (they belong to an ID that can never sign in again).
 */
export async function deleteUserAction(userId: unknown): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success) return { ok: false, error: "Unknown person." };
    if (target.data === viewer.userId) return { ok: false, error: "You cannot delete your own account here." };
      const targetRoles = (await loadAuthorization(viewer.env, target.data)).roleKeys;
    if (targetRoles.includes(ADMIN_ROLE)) {
      return { ok: false, error: "Remove the Administrator role before deleting this account." };
    }

    const account = await getAccount(target.data);
    if (!account.ok && account.reason !== "not-found") return clerkError(account, "The account could not be deleted.");
    if (account.ok) {
      const deleted = await deleteAccount(target.data);
      if (!deleted.ok) return clerkError(deleted, "The account could not be deleted. Please try again.");
    }
    await deleteUserData(viewer.env, target.data);
    revalidatePath("/admin", "layout");
    // Their page no longer exists; go back to the list.
    redirect("/admin/users");
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function createRoleAction(input: unknown): Promise<ActionResult<string>> {
  return withPermission("manage_roles", async (viewer) => {
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const permissions = [...new Set(parsed.data.permissions)] as Permission[];
    if (exceedsOwn(viewer, permissions)) {
      return { ok: false, error: "A role cannot include permissions you do not have yourself." };
    }
    const key = roleKeyFromLabel(parsed.data.label);
    if (!key) return { ok: false, error: "Please use letters or numbers in the role name." };

    const created = await createRole(viewer.env, { key, ...parsed.data, permissions });
    if (created === "exists") return { ok: false, error: "A role with that name already exists." };
    revalidatePath("/admin/roles");
    return { ok: true, value: key, message: "Role created." };
  });
}

export async function updateRoleAction(key: unknown, input: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    if (typeof key !== "string") return { ok: false, error: "Unknown role." };
    if (key === ADMIN_ROLE) return { ok: false, error: "The Administrator role always has every permission." };
    const role = await getRole(viewer.env, key);
    if (!role) return { ok: false, error: "That role no longer exists." };
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const permissions = [...new Set(parsed.data.permissions)] as Permission[];
    const added = permissions.filter((permission) => !role.permissions.includes(permission));
    if (exceedsOwn(viewer, added)) {
      return { ok: false, error: "You cannot add permissions you do not have yourself." };
    }
    // Someone who holds this role could otherwise hand themselves more.
    if (!isAdmin(viewer) && viewer.roleKeys.includes(key) && added.length > 0) {
      return { ok: false, error: "You cannot add permissions to a role you hold yourself." };
    }

    await updateRole(viewer.env, key, { ...parsed.data, permissions });
    revalidatePath("/admin/roles", "layout");
    return { ok: true, value: null, message: "Role saved." };
  });
}

export async function deleteRoleAction(key: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    if (typeof key !== "string") return { ok: false, error: "Unknown role." };
    const role = await getRole(viewer.env, key);
    if (!role) return { ok: false, error: "That role no longer exists." };
    if (role.isSystem) return { ok: false, error: "The built-in roles cannot be deleted." };
    await deleteRole(viewer.env, key);
    revalidatePath("/admin/roles", "layout");
    redirect("/admin/roles");
  });
}

// ---------------------------------------------------------------------------
// Title and instrument lists
// ---------------------------------------------------------------------------

function parseList(value: unknown): OptionList | null {
  return value === "titles" || value === "instruments" ? value : null;
}

export async function addOptionAction(list: unknown, label: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const parsed = optionLabelSchema.safeParse(label);
    if (!which) return { ok: false, error: "Unknown list." };
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if ((await addOption(viewer.env, which, parsed.data)) === "exists") {
      return { ok: false, error: "That is already on the list." };
    }
    revalidatePath("/admin/profile-options");
    return { ok: true, value: null, message: `Added ${parsed.data}.` };
  });
}

export async function renameOptionAction(list: unknown, id: unknown, label: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    const parsed = optionLabelSchema.safeParse(label);
    if (!which || !optionId) return { ok: false, error: "Unknown item." };
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if ((await renameOption(viewer.env, which, optionId, parsed.data)) === "exists") {
      return { ok: false, error: "That name is already on the list." };
    }
    revalidatePath("/admin/profile-options");
    return { ok: true, value: null, message: "Renamed." };
  });
}

export async function archiveOptionAction(list: unknown, id: unknown, archived: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    if (!which || !optionId || typeof archived !== "boolean") return { ok: false, error: "Unknown item." };
    await setOptionArchived(viewer.env, which, optionId, archived);
    revalidatePath("/admin/profile-options");
    return { ok: true, value: null, message: archived ? "Archived." : "Restored." };
  });
}

export async function moveOptionAction(list: unknown, id: unknown, direction: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    if (!which || !optionId || (direction !== "up" && direction !== "down")) return { ok: false, error: "Unknown item." };
    await moveOption(viewer.env, which, optionId, direction);
    revalidatePath("/admin/profile-options");
    return { ok: true, value: null };
  });
}
