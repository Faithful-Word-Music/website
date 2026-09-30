import "server-only";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient, type User } from "@clerk/nextjs/server";

import { siteConfig } from "@/config/site";

import type { InvitationStatus } from "./request-status";

/**
 * Every call the site makes to Clerk's Backend API, in one place. Uses
 * CLERK_SECRET_KEY on the server only.
 *
 * Callers must already have checked the viewer's permission (session.ts):
 * nothing here checks who is asking.
 *
 * Errors are logged with their Clerk code only - never the key, and never the
 * details of the person concerned beyond what is needed to find the problem.
 */

export type ClerkResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "already-exists" | "not-found" | "rate-limited" | "failed"; message?: string };

function fail<T>(action: string, error: unknown): ClerkResult<T> {
  if (isClerkAPIResponseError(error)) {
    const codes = error.errors.map((item) => item.code);
    console.error(`[auth] Clerk ${action} failed: ${error.status} ${codes.join(", ")}`);
    if (error.status === 429) return { ok: false, reason: "rate-limited" };
    if (error.status === 404 || codes.includes("resource_not_found")) return { ok: false, reason: "not-found" };
    if (codes.some((code) => code.includes("exists") || code === "form_identifier_exists" || code === "duplicate_record")) {
      return { ok: false, reason: "already-exists", message: error.errors[0]?.longMessage };
    }
    return { ok: false, reason: "failed", message: error.errors[0]?.longMessage };
  }
  console.error(`[auth] Clerk ${action} failed:`, error instanceof Error ? error.message : "unknown error");
  return { ok: false, reason: "failed" };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** The parts of a Clerk user the site shows. */
export interface AccountSummary {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  emails: string[];
  imageUrl: string;
  hasImage: boolean;
  banned: boolean;
  locked: boolean;
  createdAt: number;
  lastSignInAt: number | null;
  lastActiveAt: number | null;
}

export function summarize(user: User): AccountSummary {
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  return {
    id: user.id,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || email || "Unnamed account",
    email,
    emails: user.emailAddresses.map((item) => item.emailAddress),
    imageUrl: user.imageUrl,
    hasImage: user.hasImage,
    banned: user.banned,
    locked: user.locked,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    lastActiveAt: user.lastActiveAt,
  };
}

export async function getAccount(userId: string): Promise<ClerkResult<AccountSummary>> {
  try {
    const client = await clerkClient();
    return { ok: true, value: summarize(await client.users.getUser(userId)) };
  } catch (error) {
    return fail("getUser", error);
  }
}

export async function listAccounts(params: {
  query?: string;
  userIds?: string[];
  limit: number;
  offset: number;
}): Promise<ClerkResult<{ accounts: AccountSummary[]; total: number }>> {
  try {
    const client = await clerkClient();
    const { data, totalCount } = await client.users.getUserList({
      query: params.query || undefined,
      userId: params.userIds,
      limit: params.limit,
      offset: params.offset,
      orderBy: "-created_at",
    });
    return { ok: true, value: { accounts: data.map(summarize), total: totalCount } };
  } catch (error) {
    return fail("getUserList", error);
  }
}

export async function countAccounts(): Promise<ClerkResult<number>> {
  try {
    const client = await clerkClient();
    return { ok: true, value: await client.users.getCount() };
  } catch (error) {
    return fail("getCount", error);
  }
}

/** True when a Clerk account already uses this address. */
export async function accountExistsForEmail(email: string): Promise<ClerkResult<boolean>> {
  try {
    const client = await clerkClient();
    const { totalCount } = await client.users.getUserList({ emailAddress: [email], limit: 1 });
    return { ok: true, value: totalCount > 0 };
  } catch (error) {
    return fail("getUserList(email)", error);
  }
}

export async function updateAccountName(
  userId: string,
  name: { firstName: string; lastName: string },
): Promise<ClerkResult<null>> {
  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, { firstName: name.firstName, lastName: name.lastName });
    return { ok: true, value: null };
  } catch (error) {
    return fail("updateUser", error);
  }
}

/** Banning signs the person out everywhere and stops them signing in again. */
export async function setBanned(userId: string, banned: boolean): Promise<ClerkResult<null>> {
  try {
    const client = await clerkClient();
    if (banned) await client.users.banUser(userId);
    else await client.users.unbanUser(userId);
    return { ok: true, value: null };
  } catch (error) {
    return fail(banned ? "banUser" : "unbanUser", error);
  }
}

export async function deleteAccount(userId: string): Promise<ClerkResult<null>> {
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
    return { ok: true, value: null };
  } catch (error) {
    return fail("deleteUser", error);
  }
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface InvitationSummary {
  id: string;
  email: string;
  status: InvitationStatus;
  createdAt: number;
}

/**
 * Sends a Clerk invitation. Clerk emails it; the link opens /accept-invite on
 * this site, which is the only way to create an account (the Clerk dashboard's
 * Access mode is set to Invite-only).
 */
export async function createInvitation(email: string, redirectUrl: string): Promise<ClerkResult<InvitationSummary>> {
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      notify: true,
      expiresInDays: siteConfig.accounts.invitationDays,
      ignoreExisting: false,
    });
    return {
      ok: true,
      value: { id: invitation.id, email: invitation.emailAddress, status: invitation.status, createdAt: invitation.createdAt },
    };
  } catch (error) {
    return fail("createInvitation", error);
  }
}

export async function listInvitations(params: {
  status?: InvitationStatus;
  query?: string;
  limit?: number;
}): Promise<ClerkResult<InvitationSummary[]>> {
  try {
    const client = await clerkClient();
    const { data } = await client.invitations.getInvitationList({
      status: params.status,
      query: params.query,
      limit: params.limit ?? 100,
      orderBy: "-created_at",
    });
    return {
      ok: true,
      value: data.map((invitation) => ({
        id: invitation.id,
        email: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
      })),
    };
  } catch (error) {
    return fail("getInvitationList", error);
  }
}

export async function revokeInvitation(invitationId: string): Promise<ClerkResult<null>> {
  try {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitationId);
    return { ok: true, value: null };
  } catch (error) {
    return fail("revokeInvitation", error);
  }
}
