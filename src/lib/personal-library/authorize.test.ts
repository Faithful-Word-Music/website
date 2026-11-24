import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * withPersonalLibrary through the REAL session code, with only Clerk and the
 * database replaced, so this tests the boundary members will actually pass.
 */

const state = vi.hoisted(() => ({
  userId: "user_member" as string | null,
  roleKeys: [] as string[],
  blocked: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }), currentUser: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/clerk", () => ({ listInvitations: vi.fn() }));
vi.mock("@/lib/auth/membership-store", () => ({ consumeDecision: vi.fn(), decisionForClaim: vi.fn(), recordClaimCheck: vi.fn() }));
vi.mock("@/lib/auth/requirements", () => ({
  getViewerProfileStatus: async () => ({ state: state.blocked ? "blocked" : "complete" }),
}));
vi.mock("@/lib/auth/store", () => ({
  AccountsUnavailableError: class extends Error {},
  applyLegacyInvitation: vi.fn(),
  invitationClaimWaiting: async () => false,
  isMembershipInstalled: async () => true,
  legacyInvitationRows: vi.fn(),
  membershipClient: vi.fn(),
  loadAuthorization: async () => ({
    roleKeys: state.roleKeys,
    rolePermissions: new Map(),
    overrides: [],
    sheetPolicy: { mode: "enforcing", affiliation: null },
  }),
}));

import { ACTION_ERRORS } from "@/lib/auth/session";

import { withPersonalLibrary } from "./authorize";

describe("withPersonalLibrary", () => {
  beforeEach(() => {
    state.userId = "user_member";
    state.roleKeys = [];
    state.blocked = false;
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_URL", "postgres://isolated.invalid/none");
  });

  const run = () => {
    const action = vi.fn(async (owner: { env: string; userId: string }) => ({ ok: true as const, value: owner }));
    return { action, result: withPersonalLibrary(action) };
  };

  it("admits a Member with no role, affiliation or sheet music access", async () => {
    const { result } = run();
    expect(await result).toEqual({ ok: true, value: { env: "development", userId: "user_member" } });
  });

  it("takes the environment from the Clerk keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_x");
    vi.stubEnv("VERCEL_ENV", "production");
    const { result } = run();
    expect(await result).toMatchObject({ value: { env: "production" } });
  });

  it("refuses anyone without a session: signed out, disabled, deleted or never accepted", async () => {
    state.userId = null;
    const { action, result } = run();
    expect(await result).toEqual({ ok: false, error: ACTION_ERRORS.signedOut });
    expect(action).not.toHaveBeenCalled();
  });

  it("keeps the mandatory profile gate", async () => {
    state.blocked = true;
    const { action, result } = run();
    expect(await result).toEqual({ ok: false, error: ACTION_ERRORS.profileIncomplete });
    expect(action).not.toHaveBeenCalled();
  });

  it("applies the profile gate to an Administrator too", async () => {
    state.roleKeys = ["admin"];
    state.blocked = true;
    const { action, result } = run();
    expect(await result).toEqual({ ok: false, error: ACTION_ERRORS.profileIncomplete });
    expect(action).not.toHaveBeenCalled();
  });

  it("gives an Administrator only their own identity", async () => {
    state.userId = "user_admin";
    state.roleKeys = ["admin"];
    const { result } = run();
    expect(await result).toMatchObject({ value: { userId: "user_admin" } });
  });

  it("fails closed when accounts are not configured", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const { action, result } = run();
    expect(await result).toEqual({ ok: false, error: ACTION_ERRORS.unavailable });
    expect(action).not.toHaveBeenCalled();
  });
});
