import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { siteConfig } from "@/config/site";
import { isSitePath } from "@/lib/page-origin";

import { currentClerkConfig, warnIfMisconfigured, type ClerkEnv } from "./clerk-env";
import { canAccessAdmin, explicitPermissions, resolvePermissions, type Permission } from "./permissions";
import type { ProfileStatus } from "./profile-requirements";
import { normalizeEmail } from "./request-status";
import { getViewerProfileStatus } from "./requirements";
import {
  AccountsUnavailableError,
  applyInvitationRoles,
  hasPendingInvitationRoles,
  loadAuthorization,
} from "./store";

/**
 * Who is asking, and what they may do. The only entry point protected code
 * should use:
 *
 *   1. Clerk verifies the session (auth()).
 *   2. The Clerk user ID is looked up in this site's own role tables.
 *   3. The permission is checked here, on the server.
 *
 * Nothing about a person's roles is ever taken from the browser, and hiding a
 * button is never the protection - every page and every action checks again.
 */

export type AccountsStatus =
  | { available: true; env: ClerkEnv }
  | { available: false; reason: "not-configured" | "misconfigured" | "no-database" };

/** Whether accounts can work in this deployment at all. */
export function accountsStatus(): AccountsStatus {
  const config = currentClerkConfig();
  if (config.status === "missing") return { available: false, reason: "not-configured" };
  if (config.status === "invalid") {
    warnIfMisconfigured(config);
    return { available: false, reason: "misconfigured" };
  }
  if (!process.env.DATABASE_URL) {
    console.error("[auth] Accounts are disabled: DATABASE_URL is not set.");
    return { available: false, reason: "no-database" };
  }
  return { available: true, env: config.env };
}

/**
 * accountsStatus() for a page: waits for the request first, so the answer is
 * never baked into a prerendered page at build time.
 */
export async function requestAccountsStatus(): Promise<AccountsStatus> {
  await connection();
  return accountsStatus();
}

export interface Viewer {
  userId: string;
  env: ClerkEnv;
  roleKeys: string[];
  permissions: Set<Permission>;
  /**
   * Permissions held on purpose - not through the Administrator role's
   * blanket "everything" (explicitPermissions()). Decides participation:
   * who is asked the musician and song-leader questions.
   */
  explicit: Set<Permission>;
  can(permission: Permission): boolean;
  canAccessAdmin: boolean;
}

/**
 * The signed-in person, or null (signed out, or accounts unavailable here).
 * Cached for the length of one request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const status = accountsStatus();
  if (!status.available) return null;

  const { userId } = await auth();
  if (!userId) return null;

  let { roleKeys, rolePermissions, overrides } = await loadAuthorization(status.env, userId);

  // Someone new, with no roles yet: give them any roles chosen when they were
  // invited. Their email is only looked up when an invitation is actually
  // waiting to hand out roles, so ordinary requests pay nothing for this.
  if (roleKeys.length === 0 && (await hasPendingInvitationRoles(status.env))) {
    const user = await currentUser();
    const emails = user?.emailAddresses.map((item) => normalizeEmail(item.emailAddress)) ?? [];
    if ((await applyInvitationRoles(status.env, userId, emails)) > 0) {
      ({ roleKeys, rolePermissions, overrides } = await loadAuthorization(status.env, userId));
    }
  }

  const permissions = resolvePermissions(roleKeys, rolePermissions, overrides);
  return {
    userId,
    env: status.env,
    roleKeys,
    permissions,
    explicit: explicitPermissions(roleKeys, rolePermissions, overrides),
    can: (permission) => permissions.has(permission),
    canAccessAdmin: canAccessAdmin(permissions),
  };
});

/** A login link that brings the person back to `returnTo` afterwards. */
export function loginUrl(returnTo: string): string {
  return `/login?redirect_url=${encodeURIComponent(returnTo)}`;
}

// ---------------------------------------------------------------------------
// The profile gate (docs/profile-requirements.md)
// ---------------------------------------------------------------------------

/**
 * Whether a page or action asks for a finished profile. Every one does by
 * default; the exemptions - recovery, help and the places where a profile is
 * finished - pass `profileGate: false`, and each is listed in
 * docs/profile-requirements.md (src/lib/auth/profile-gate.test.ts checks the
 * list against the code).
 */
export interface GateOptions {
  profileGate?: boolean;
}

/** The signed-in person's profile status (once per request; never throws). */
export function viewerProfileStatus(viewer: Viewer): Promise<ProfileStatus> {
  return getViewerProfileStatus(viewer);
}

/** True when a missing requirement is past its deadline and the policy is enforcing. */
export async function isProfileBlocked(viewer: Viewer): Promise<boolean> {
  return (await viewerProfileStatus(viewer)).state === "blocked";
}

/** Where a blocked person is sent: onboarding, then back to where they were going. */
export function welcomeUrl(returnTo: string): string {
  // Only a page on this site, and never onboarding itself - no loop, and never a link off the site.
  const next = isSitePath(returnTo) && !returnTo.startsWith("/welcome") ? returnTo : null;
  return next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome";
}

/** A route's answer for someone whose profile must be finished first. */
export const PROFILE_INCOMPLETE = { error: "profile-incomplete", href: "/welcome" } as const;

/**
 * The signed-in person, for a page. Signed-out visitors are sent to /login and
 * brought back afterwards. (The proxy does this first; this is the backstop.)
 * Someone whose required profile answers are overdue is sent to /welcome,
 * unless the page is one of the exemptions.
 */
export async function requireViewer(returnTo: string, options: GateOptions = {}): Promise<Viewer> {
  const status = await requestAccountsStatus();
  if (!status.available) redirect("/login");
  const viewer = await getViewer();
  if (!viewer) redirect(loginUrl(returnTo));
  if (options.profileGate !== false && (await isProfileBlocked(viewer))) redirect(welcomeUrl(returnTo));
  return viewer;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export type ActionResult<T = null> = { ok: true; value: T; message?: string } | { ok: false; error: string };

export const ACTION_ERRORS = {
  signedOut: "Your session has ended. Please log in again.",
  forbidden: "You do not have permission to do that.",
  unavailable: "Accounts are temporarily unavailable. Please try again later.",
  failed: "Something went wrong. Please try again.",
  profileIncomplete: "Please finish your profile first - it only takes a few minutes.",
} as const;

/**
 * Runs a server action only for a signed-in person holding `permission`
 * (or any signed-in person when it is null). Server actions are public POST
 * endpoints, so every one of them goes through this.
 *
 * Unexpected errors are logged and reported to the browser as a generic
 * message - never a stack trace or a database/Clerk detail.
 */
export async function withPermission<T>(
  permission: Permission | null,
  action: (viewer: Viewer) => Promise<ActionResult<T>>,
  options: GateOptions = {},
): Promise<ActionResult<T>> {
  let viewer: Viewer | null;
  try {
    if (!accountsStatus().available) return { ok: false, error: ACTION_ERRORS.unavailable };
    viewer = await getViewer();
  } catch (error) {
    console.error("[auth] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: ACTION_ERRORS.unavailable };
  }
  if (!viewer) return { ok: false, error: ACTION_ERRORS.signedOut };
  if (permission && !viewer.can(permission)) {
    console.warn(`[auth] Refused ${permission} for ${viewer.userId}.`);
    return { ok: false, error: ACTION_ERRORS.forbidden };
  }
  if (options.profileGate !== false && (await isProfileBlocked(viewer))) {
    return { ok: false, error: ACTION_ERRORS.profileIncomplete };
  }

  try {
    return await action(viewer);
  } catch (error) {
    if (error instanceof AccountsUnavailableError) return { ok: false, error: ACTION_ERRORS.unavailable };
    // redirect() and notFound() work by throwing; let Next.js handle them.
    if (isNextControlFlow(error)) throw error;
    console.error("[auth] Action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: ACTION_ERRORS.failed };
  }
}

/**
 * withPermission() for an action someone must still reach while their
 * profile is overdue: finishing the profile itself, notification and push
 * settings, asking for help, and administering accounts (so an
 * administrator can always resolve a problem). Every caller is one of the
 * exemptions listed in docs/profile-requirements.md.
 */
export function withPermissionExempt<T>(
  permission: Permission | null,
  action: (viewer: Viewer) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return withPermission(permission, action, { profileGate: false });
}

/** The page-side twin of withPermissionExempt(). */
export const PROFILE_GATE_EXEMPT: GateOptions = { profileGate: false };

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

/**
 * The base URL for links this site sends out (invitations, review emails).
 * Production always uses the real domain. A Preview deployment uses its own
 * branch address, set by Vercel - never a request header, which a visitor
 * could forge to point a review email somewhere else. Only a local server
 * (not on Vercel at all) uses the address it was reached on, which is
 * localhost. Either way a test invitation never points at the live site.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.VERCEL_ENV === "production") return siteConfig.url;
  const vercelHost = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  const host = (await headers()).get("host") ?? "localhost:3000";
  return `http://${host}`;
}

/**
 * For admin pages: the signed-in person if they hold ANY of `permissions`,
 * otherwise null (the page then shows "no access"). Signed-out visitors are
 * sent to log in.
 */
export async function requireAnyPermission(
  returnTo: string,
  permissions: Permission[],
  options: GateOptions = {},
): Promise<Viewer | null> {
  const viewer = await requireViewer(returnTo, options);
  return permissions.some((permission) => viewer.can(permission)) ? viewer : null;
}
