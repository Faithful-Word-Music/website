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
import { ADMIN_ROLE, MEMBER_ROLE, isPermission, roleKeyFromLabel, type Permission } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/request-status";
import { siteOrigin, withPermission, type ActionResult, type Viewer } from "@/lib/auth/session";
import {
  addOption,
  assignRole,
  claimRequestForApproval,
  createRole,
  deleteInvitationRoles,
  deleteOption,
  deleteRole,
  deleteUserData,
  getRole,
  listRoles,
  loadAuthorization,
  markInvitationRevoked,
  moveOption,
  recordRequestInvitation,
  rejectRequest,
  releaseRequestClaim,
  removeOverride,
  removeRole,
  renameOption,
  setInvitationRoles,
  setOptionArchived,
  setOverride,
  setSheetMusicTypes,
  setUserTitles,
  updateRole,
  addSheetMusicSource,
  addSheetMusicType,
  deleteSheetMusicType,
  listSheetMusicTypes,
  moveSheetMusicType,
  removeSheetMusicSource,
  renameSheetMusicType,
  setCapoPolicy,
  type OptionList,
} from "@/lib/auth/store";
import { siteConfig } from "@/config/site";
import { aiContent } from "@/content/ai";
import { isMemoryScope } from "@/lib/ai/memory/memory";
import { createMemory, deleteMemory, moveMemory, updateMemory, type MemoryProblem, type MemoryResult } from "@/lib/ai/memory/service";
import { memoryDeps } from "@/lib/ai/memory/store";
import { composePhilosophy, PHILOSOPHY_EDIT_LIMITS, type DraftSection } from "@/lib/ai/planning/revisions";
import { philosophyDeps } from "@/lib/ai/planning/run";
import { restorePhilosophy, savePhilosophy, type PhilosophyChangeResult } from "@/lib/ai/planning/service";
import { getPhilosophyRevision } from "@/lib/ai/planning/store";
import { generateAiText } from "@/lib/ai/service";
import type { AiTokenUsage } from "@/lib/ai/usage";
import { refreshLibraryIndex } from "@/lib/library-content/indexer";
import type { RefreshReport } from "@/lib/library-content/plan";
import { MAX_ACCIDENTALS } from "@/lib/capo-policy";
import { ANYWHERE, FORMAT_FOLDERS, sourceCoverage } from "@/lib/sheet-music";
import { getSheetMusicSources } from "@/lib/sheet-music-index";
import { describeSource } from "@/lib/sheet-music-type";

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

/**
 * Roles to give someone when they accept an invitation. The same rules as
 * giving roles on a person's page: it needs "Manage roles", only
 * administrators can hand out Administrator, and nobody can hand out a role
 * with permissions they lack themselves.
 */
async function checkInvitationRoles(
  viewer: Viewer,
  roleKeys: unknown,
): Promise<{ ok: true; value: string[] } | { ok: false; error: string }> {
  if (!Array.isArray(roleKeys) || roleKeys.length > 20 || !roleKeys.every((key) => typeof key === "string")) {
    return { ok: false, error: "Unknown role." };
  }
  const keys = [...new Set(roleKeys as string[])].filter((key) => key !== MEMBER_ROLE);
  if (keys.length === 0) return { ok: true, value: [] };
  if (!viewer.can("manage_roles")) {
    return { ok: false, error: "Choosing roles needs the Manage roles permission. Send the invitation without roles." };
  }
  const roles = new Map((await listRoles(viewer.env)).map((role) => [role.key, role]));
  for (const key of keys) {
    const role = roles.get(key);
    if (!role) return { ok: false, error: "One of the chosen roles no longer exists." };
    if (key === ADMIN_ROLE && !isAdmin(viewer)) {
      return { ok: false, error: "Only administrators can give the Administrator role." };
    }
    if (exceedsOwn(viewer, role.permissions.filter(isPermission))) {
      return { ok: false, error: `${role.label} includes permissions you do not have yourself.` };
    }
  }
  return { ok: true, value: keys };
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
export async function approveRequestAction(id: unknown, roleKeys: unknown = []): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const requestId = parseId(id);
    if (!requestId) return { ok: false, error: "Unknown request." };
    // Checked before anything is sent, so a refused role never leaves a half-done approval.
    const roles = await checkInvitationRoles(viewer, roleKeys);
    if (!roles.ok) return roles;

    const request = await claimRequestForApproval(viewer.env, requestId, viewer.userId);
    if (!request) return { ok: false, error: "This request has already been reviewed." };

    const invitation = await createInvitation(normalizeEmail(request.email), `${await siteOrigin()}/accept-invite`);
    if (!invitation.ok) {
      await releaseRequestClaim(viewer.env, requestId);
      return clerkError(invitation, "The invitation could not be sent. The request is still pending - please try again.");
    }

    await recordRequestInvitation(viewer.env, requestId, invitation.value.id);
    await setInvitationRoles(viewer.env, invitation.value.id, normalizeEmail(request.email), roles.value, viewer.userId);
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

export async function inviteAction(email: unknown, roleKeys: unknown = []): Promise<ActionResult> {
  return withPermission("manage_users", async (viewer) => {
    const parsed = inviteSchema.safeParse({ email });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const roles = await checkInvitationRoles(viewer, roleKeys);
    if (!roles.ok) return roles;

    const address = normalizeEmail(parsed.data.email);
    const invitation = await createInvitation(address, `${await siteOrigin()}/accept-invite`);
    if (!invitation.ok) {
      if (invitation.reason === "already-exists") {
        return { ok: false, error: "That address already has an account or a pending invitation." };
      }
      return clerkError(invitation, "The invitation could not be sent. Please try again.");
    }
    await setInvitationRoles(viewer.env, invitation.value.id, address, roles.value, viewer.userId);
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
    await deleteInvitationRoles(viewer.env, parsed.data);
    revalidatePath("/admin", "layout");
    return { ok: true, value: null, message: "Invitation revoked. Its link no longer works." };
  });
}

// ---------------------------------------------------------------------------
// People: roles, exceptions, titles, access
// ---------------------------------------------------------------------------

/**
 * Saves a batch of role changes ({ roleKey, assigned }) at once. Every change
 * is checked before any is applied, so one refused change saves nothing.
 */
export async function setUserRolesAction(userId: unknown, changes: unknown): Promise<ActionResult> {
  return withPermission("manage_roles", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (
      !target.success ||
      !Array.isArray(changes) ||
      changes.length === 0 ||
      changes.length > 50 ||
      !changes.every(
        (change) =>
          typeof change === "object" &&
          change !== null &&
          typeof change.roleKey === "string" &&
          typeof change.assigned === "boolean",
      )
    ) {
      return { ok: false, error: "Unknown person or role." };
    }
    const requested = changes as Array<{ roleKey: string; assigned: boolean }>;
    if (new Set(requested.map((change) => change.roleKey)).size !== requested.length) {
      return { ok: false, error: "Unknown person or role." };
    }

    // Your own roles: only an administrator may change them - they already
    // hold every permission, so no role can raise them further - and never
    // the Administrator role itself, so nobody can lock themselves out.
    if (target.data === viewer.userId) {
      if (!isAdmin(viewer)) {
        return { ok: false, error: "You cannot change your own roles. Ask an administrator." };
      }
      if (requested.some((change) => change.roleKey === ADMIN_ROLE)) {
        return { ok: false, error: "You cannot remove your own Administrator role. Ask another administrator." };
      }
    }
    if (await targetIsProtectedFrom(viewer, target.data)) {
      return { ok: false, error: "Only administrators can change an administrator's roles." };
    }
    for (const change of requested) {
      const role = await getRole(viewer.env, change.roleKey);
      if (!role) return { ok: false, error: "That role no longer exists." };
      if (change.roleKey === ADMIN_ROLE && !isAdmin(viewer)) {
        return { ok: false, error: "Only administrators can give or remove the Administrator role." };
      }
      if (change.assigned && exceedsOwn(viewer, role.permissions.filter(isPermission))) {
        return { ok: false, error: `${role.label} includes permissions you do not have yourself.` };
      }
    }

    // Removing the last administrator is the one change that can still be
    // refused, so it goes first - before anything else has been saved.
    const ordered = [...requested].sort(
      (a, b) => Number(b.roleKey === ADMIN_ROLE && !b.assigned) - Number(a.roleKey === ADMIN_ROLE && !a.assigned),
    );
    for (const change of ordered) {
      if (change.assigned) {
        await assignRole(viewer.env, target.data, change.roleKey, viewer.userId);
      } else if ((await removeRole(viewer.env, target.data, change.roleKey)) === "last-admin") {
        return { ok: false, error: "This is the only administrator. Make someone else an administrator first." };
      }
    }
    revalidatePath(`/admin/users/${target.data}`);
    return { ok: true, value: null, message: "Roles saved." };
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

/**
 * Chooses the types of sheet music a person is given (their ids), in order
 * of preference; an empty list clears them. Only types offered under Admin
 * -> Configuration can be chosen - checked here against that list.
 */
export async function setSheetMusicTypesAction(userId: unknown, typeIds: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const target = clerkUserIdSchema.safeParse(userId);
    if (!target.success) return { ok: false, error: "Unknown person." };
    if (!Array.isArray(typeIds) || typeIds.length > 20) return { ok: false, error: "Unknown sheet music type." };

    const ids = typeIds.map(parseId);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      return { ok: false, error: "Unknown sheet music type." };
    }
    const offered = await listSheetMusicTypes(viewer.env);
    const types = ids.flatMap((id) => offered.find((type) => type.id === id) ?? []);
    if (types.length !== ids.length) return { ok: false, error: "That sheet music type no longer exists." };

    await setSheetMusicTypes(viewer.env, target.data, types.map((type) => type.id), viewer.userId);
    revalidatePath(`/admin/users/${target.data}`);
    return {
      ok: true,
      value: null,
      message:
        types.length === 0
          ? "Sheet music cleared. Their Dashboard shows no sheet music."
          : `Sheet music set to ${types.map((type) => type.label).join(", then ")}.`,
    };
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
    revalidatePath("/admin/configuration");
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
    revalidatePath("/admin/configuration");
    return { ok: true, value: null, message: "Renamed." };
  });
}

export async function archiveOptionAction(list: unknown, id: unknown, archived: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    if (!which || !optionId || typeof archived !== "boolean") return { ok: false, error: "Unknown item." };
    await setOptionArchived(viewer.env, which, optionId, archived);
    revalidatePath("/admin/configuration");
    return { ok: true, value: null, message: archived ? "Archived." : "Restored." };
  });
}

/** Deletes a title or instrument, taking it off any profile that had it. */
export async function deleteOptionAction(list: unknown, id: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    if (!which || !optionId) return { ok: false, error: "Unknown item." };
    await deleteOption(viewer.env, which, optionId);
    revalidatePath("/admin/configuration");
    revalidatePath("/admin/users", "layout");
    return { ok: true, value: null, message: "Deleted." };
  });
}

export async function moveOptionAction(list: unknown, id: unknown, direction: unknown): Promise<ActionResult> {
  return withPermission("manage_profiles", async (viewer) => {
    const which = parseList(list);
    const optionId = parseId(id);
    if (!which || !optionId || (direction !== "up" && direction !== "down")) return { ok: false, error: "Unknown item." };
    await moveOption(viewer.env, which, optionId, direction);
    revalidatePath("/admin/configuration");
    return { ok: true, value: null };
  });
}

// ---------------------------------------------------------------------------
// Sheet music types and their source folders
// ---------------------------------------------------------------------------

function revalidateSheetMusicTypes() {
  revalidatePath("/admin/configuration");
  revalidatePath("/admin/users", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/library/songs", "layout");
}

/** A capo threshold: 1 to 7 flats or sharps, or null for "off". */
function parseThreshold(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_ACCIDENTALS ? value : undefined;
}

/** Saves when a song needs capo sheet music, and which type that is (src/lib/capo-policy.ts). */
export async function setCapoPolicyAction(input: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const minFlats = parseThreshold(value.minFlats);
    const minSharps = parseThreshold(value.minSharps);
    if (minFlats === undefined || minSharps === undefined) return { ok: false, error: "Choose 1 to 7, or Off." };
    const typeId = value.typeId === null ? null : parseId(value.typeId);
    if (value.typeId !== null && !typeId) return { ok: false, error: "Unknown type." };
    if (typeId && !(await listSheetMusicTypes(viewer.env)).some((type) => type.id === typeId)) {
      return { ok: false, error: "Unknown type." };
    }
    await setCapoPolicy(viewer.env, { minFlats, minSharps, typeId }, viewer.userId);
    revalidateSheetMusicTypes();
    revalidatePath("/service-planner", "layout");
    return { ok: true, value: null, message: "Saved." };
  });
}

export async function addSheetMusicTypeAction(label: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const parsed = optionLabelSchema.safeParse(label);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if ((await addSheetMusicType(viewer.env, parsed.data)) === "exists") {
      return { ok: false, error: "Another type already has that name." };
    }
    revalidateSheetMusicTypes();
    return { ok: true, value: null, message: `Added ${parsed.data}. Now add a source folder for it.` };
  });
}

export async function renameSheetMusicTypeAction(id: unknown, label: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const typeId = parseId(id);
    if (!typeId) return { ok: false, error: "Unknown type." };
    const parsed = optionLabelSchema.safeParse(label);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    if ((await renameSheetMusicType(viewer.env, typeId, parsed.data)) === "exists") {
      return { ok: false, error: "Another type already has that name." };
    }
    revalidateSheetMusicTypes();
    return { ok: true, value: null, message: "Renamed." };
  });
}

/** Deletes a type; anyone assigned it is left with no sheet music type. */
export async function deleteSheetMusicTypeAction(id: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const typeId = parseId(id);
    if (!typeId) return { ok: false, error: "Unknown type." };
    await deleteSheetMusicType(viewer.env, typeId);
    revalidateSheetMusicTypes();
    return { ok: true, value: null, message: "Deleted." };
  });
}

export async function moveSheetMusicTypeAction(id: unknown, direction: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const typeId = parseId(id);
    if (!typeId || (direction !== "up" && direction !== "down")) return { ok: false, error: "Unknown type." };
    await moveSheetMusicType(viewer.env, typeId, direction);
    revalidateSheetMusicTypes();
    return { ok: true, value: null };
  });
}

/**
 * A source folder as sent: folder names below "Sheet Music". Checked against
 * Drive itself: the folder must be there, and must not be a PDF or MuseScore
 * folder (a source always takes both).
 */
async function checkSourcePath(
  value: unknown,
): Promise<{ ok: true; path: string[]; coverage: SourceCoverage } | { ok: false; error: string }> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 20 ||
    !value.every((segment) => typeof segment === "string" && segment.length > 0 && segment.length <= 200)
  ) {
    return { ok: false, error: "Please choose a folder." };
  }
  const path = value as string[];
  if (path.includes(ANYWHERE)) return { ok: false, error: "Please choose a folder." };
  if (FORMAT_FOLDERS.has(path[path.length - 1].toLowerCase())) {
    return { ok: false, error: "Choose the folder above PDF and MuseScore; a source always takes both." };
  }
  const drive = await getSheetMusicSources();
  if (!drive.ok) return { ok: false, error: "Google Drive could not be read just now. Please try again shortly." };
  const coverage = sourceCoverage(drive.sources, path);
  if (coverage.folders.length === 0) return { ok: false, error: "That folder is no longer in Drive." };
  return { ok: true, path, coverage };
}

type SourceCoverage = ReturnType<typeof sourceCoverage>;

/** What a source would cover, for the picker's preview. Changes nothing. */
export async function previewSheetMusicSourceAction(path: unknown): Promise<ActionResult<SourceCoverage>> {
  return withPermission("manage_sheet_music", async () => {
    const checked = await checkSourcePath(path);
    if (!checked.ok) return checked;
    return { ok: true, value: checked.coverage };
  });
}

export async function addSheetMusicSourceAction(typeId: unknown, path: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const id = parseId(typeId);
    if (!id) return { ok: false, error: "Unknown type." };
    const checked = await checkSourcePath(path);
    if (!checked.ok) return checked;
    const result = await addSheetMusicSource(viewer.env, id, checked.path);
    if (result === "missing") return { ok: false, error: "That type no longer exists." };
    if (result === "exists") return { ok: false, error: "This type already has that source." };
    revalidateSheetMusicTypes();
    return { ok: true, value: null, message: `Folder added: ${describeSource(checked.path)}.` };
  });
}

export async function removeSheetMusicSourceAction(sourceId: unknown): Promise<ActionResult> {
  return withPermission("manage_sheet_music", async (viewer) => {
    const id = parseId(sourceId);
    if (!id) return { ok: false, error: "Unknown source." };
    await removeSheetMusicSource(viewer.env, id);
    revalidateSheetMusicTypes();
    return { ok: true, value: null, message: "Folder removed." };
  });
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** What the connection test reports back: the model's reply, and what was logged for it. */
export interface AiTestOutcome {
  reply: string;
  model: string;
  tokens: AiTokenUsage;
  costUsd: number | null;
  durationMs: number;
}

/**
 * Admin -> AI's connection test: one tiny request through the shared AI layer
 * (src/lib/ai/service.ts), which proves the key, the model and the usage log
 * end to end. The prompt is fixed - nothing typed is ever sent - so this
 * cannot be used as a way to ask the model anything else.
 */
export async function testAiConnectionAction(): Promise<ActionResult<AiTestOutcome>> {
  return withPermission("use_ai", async (viewer) => {
    const result = await generateAiText({
      viewer,
      feature: "connection_test",
      instructions: "You are confirming that a website can reach you. Answer in one short, plain sentence.",
      prompt: "Say that the connection to Faithful Word Music is working.",
      maxOutputTokens: 400,
      reasoning: "low",
    });
    revalidatePath("/admin/ai");
    if (!result.ok) return { ok: false, error: result.message };
    return {
      ok: true,
      value: {
        reply: result.text.trim().slice(0, 400),
        model: result.model,
        tokens: result.tokens,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      },
      message: "The model answered.",
    };
  });
}

// ---------------------------------------------------------------------------
// AI memory
// ---------------------------------------------------------------------------

const MEMORY_ERRORS: Record<MemoryProblem, string> = aiContent.admin.memory.errors;

/** Memory is used by Conductor on every page and by the planner, none of which is cached per memory; only its own page is. */
function memoryResult(result: MemoryResult, message: string): ActionResult {
  if (!result.ok) return { ok: false, error: MEMORY_ERRORS[result.problem] };
  revalidatePath("/admin/ai/memory");
  return { ok: true, value: null, message };
}

/**
 * Admin -> AI -> Memory. Every one of these goes through the memory rules
 * (src/lib/ai/memory/service.ts), the same ones a card in Conductor is settled
 * by: a personal memory needs use_personal_ai_memory and is only ever the
 * person's own; a global one needs manage_global_ai_memory; moving one between
 * the two needs both. use_ai is only the way in.
 */
export async function createMemoryAction(scope: unknown, text: unknown, category: unknown): Promise<ActionResult> {
  return withPermission("use_ai", async (viewer) => {
    if (!isMemoryScope(scope)) return { ok: false, error: MEMORY_ERRORS.invalid };
    return memoryResult(await createMemory(viewer, { scope, text, category }, memoryDeps(viewer.env)), aiContent.admin.memory.saved);
  });
}

export async function updateMemoryAction(id: unknown, text: unknown, category: unknown): Promise<ActionResult> {
  return withPermission("use_ai", async (viewer) => {
    const memoryId = parseId(id);
    if (!memoryId) return { ok: false, error: MEMORY_ERRORS["not-found"] };
    return memoryResult(await updateMemory(viewer, { id: memoryId, text, category }, memoryDeps(viewer.env)), aiContent.admin.memory.saved);
  });
}

export async function deleteMemoryAction(id: unknown): Promise<ActionResult> {
  return withPermission("use_ai", async (viewer) => {
    const memoryId = parseId(id);
    if (!memoryId) return { ok: false, error: MEMORY_ERRORS["not-found"] };
    return memoryResult(await deleteMemory(viewer, memoryId, memoryDeps(viewer.env)), aiContent.admin.memory.deleted);
  });
}

export async function moveMemoryAction(id: unknown, scope: unknown): Promise<ActionResult> {
  return withPermission("use_ai", async (viewer) => {
    const memoryId = parseId(id);
    if (!memoryId) return { ok: false, error: MEMORY_ERRORS["not-found"] };
    if (!isMemoryScope(scope)) return { ok: false, error: MEMORY_ERRORS.invalid };
    return memoryResult(await moveMemory(viewer, { id: memoryId, scope }, memoryDeps(viewer.env)), aiContent.admin.memory.moved[scope]);
  });
}

// ---------------------------------------------------------------------------
// The planning philosophy
// ---------------------------------------------------------------------------

function philosophyResult(result: PhilosophyChangeResult, message: string): ActionResult {
  if (!result.ok) return { ok: false, error: aiContent.admin.philosophy.errors[result.problem] };
  revalidatePath("/admin/ai/philosophy");
  return { ok: true, value: null, message };
}

/**
 * Admin -> AI -> Planning Philosophy: applies the document as edited, as a new
 * version on top of the one the editor was opened on (`baseRevisionId`). The
 * same function applies a change Conductor proposed (savePhilosophy in
 * src/lib/ai/planning/service.ts), so both are checked and recorded alike.
 */
export async function savePhilosophyAction(input: unknown): Promise<ActionResult> {
  return withPermission("manage_planning_philosophy", async (viewer) => {
    const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const baseRevisionId = parseId(value.baseRevisionId);
    const sections = Array.isArray(value.sections) ? value.sections : null;
    if (!baseRevisionId || !sections || typeof value.title !== "string") return { ok: false, error: aiContent.admin.philosophy.errors.invalid };

    const draft: DraftSection[] = [];
    for (const item of sections as Array<Record<string, unknown> | null>) {
      if (!item || typeof item.title !== "string" || typeof item.text !== "string") return { ok: false, error: aiContent.admin.philosophy.errors.invalid };
      const title = item.title.replace(/\s+/g, " ").trim();
      if (title === "" || title.length > PHILOSOPHY_EDIT_LIMITS.titleChars) return { ok: false, error: aiContent.admin.philosophy.errors.heading };
      if (item.text.trim() === "") return { ok: false, error: aiContent.admin.philosophy.errors.emptySection.replace("{section}", title) };
      draft.push({ title, text: item.text });
    }

    const result = await savePhilosophy(
      viewer,
      {
        markdown: composePhilosophy({ title: value.title, sections: draft }),
        source: "manual",
        note: typeof value.note === "string" ? value.note : null,
        baseRevisionId,
      },
      philosophyDeps(viewer.env),
    );
    return philosophyResult(result, aiContent.admin.philosophy.saved);
  });
}

/** One earlier version of the philosophy, whole, to read or compare. For anyone who may use AI: it is what the AI was planning by. */
export async function loadPhilosophyRevisionAction(revisionId: unknown): Promise<ActionResult<{ markdown: string }>> {
  return withPermission("use_ai", async (viewer) => {
    const id = parseId(revisionId);
    const revision = id ? await getPhilosophyRevision(viewer.env, id) : null;
    if (!revision) return { ok: false, error: aiContent.admin.philosophy.errors["not-found"] };
    return { ok: true, value: { markdown: revision.markdown } };
  });
}

/** Brings an earlier version of the philosophy back, as a new version: nothing in the history is lost. */
export async function restorePhilosophyAction(revisionId: unknown, baseRevisionId: unknown): Promise<ActionResult> {
  return withPermission("manage_planning_philosophy", async (viewer) => {
    const id = parseId(revisionId);
    const base = parseId(baseRevisionId);
    if (!id || !base) return { ok: false, error: aiContent.admin.philosophy.errors["not-found"] };
    const result = await restorePhilosophy(viewer, { revisionId: id, baseRevisionId: base }, philosophyDeps(viewer.env));
    return philosophyResult(result, aiContent.admin.philosophy.restored);
  });
}

/** One pass of a refresh of the library index: what it did, and whether embedding stopped short. */
export interface LibraryRefreshOutcome {
  report: RefreshReport;
  /** Why embedding stopped, in words safe to show; null when it did not. */
  embeddingMessage: string | null;
}

/**
 * Admin -> AI's "Refresh library index": one pass of reading the lyrics out
 * of the Standard MuseScore files into the library index and embedding them
 * (src/lib/library-content/indexer.ts). A pass works for a limited time and
 * reports what is left; the page calls again, with `continuing`, until
 * nothing is. It reads Drive and writes only the index - never a service, a
 * plan or anything a person made.
 */
export async function refreshLibraryIndexAction(continuing: unknown): Promise<ActionResult<LibraryRefreshOutcome>> {
  return withPermission("use_ai", async (viewer) => {
    const result = await refreshLibraryIndex(viewer, { continuing: continuing === true });
    revalidatePath("/admin/ai");
    if (!result.ok) {
      const { errors } = aiContent.admin.library;
      return { ok: false, error: errors[result.reason].replace("{type}", siteConfig.sheetMusic.lyricsType) };
    }
    return { ok: true, value: { report: result.report, embeddingMessage: result.embeddingMessage } };
  });
}
