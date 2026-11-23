import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission } from "./permissions";
import { projectSheetPermission, resolveSheetEntitlement } from "./sheet-entitlement";

/**
 * Calls the real routes and server actions as people who must be refused.
 * The database throws if touched, so a refusal has to come before any read.
 */

// The first import of the admin actions loads much of the site.
vi.setConfig({ testTimeout: 60_000 });

const state = vi.hoisted(() => ({ viewer: null as unknown, invite: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }), currentUser: async () => null, clerkClient: async () => ({}) }));
vi.mock("botid/server", () => ({ checkBotId: async () => ({ isBot: false }) }));
vi.mock("@/lib/db", () => ({
  getSql: () => {
    throw new Error("the database was reached");
  },
  applySchema: async () => {
    throw new Error("the database was reached");
  },
  SCHEMA_LOCK: 1,
}));
vi.mock("@/lib/auth/clerk", async (original) => ({
  ...(await original<typeof import("@/lib/auth/clerk")>()),
  createInvitation: state.invite,
}));
vi.mock("@/lib/auth/session", async (original) => {
  const real = await original<typeof import("@/lib/auth/session")>();
  // The real gate's order: signed in, then the named permission, then the action.
  const withPermission = async (permission: Permission | null, action: (viewer: never) => unknown) => {
    const viewer = state.viewer as { can(p: Permission): boolean } | null;
    if (!viewer) return { ok: false, error: real.ACTION_ERRORS.signedOut };
    if (permission && !viewer.can(permission)) return { ok: false, error: real.ACTION_ERRORS.forbidden };
    return action(viewer as never);
  };
  return {
    ...real,
    getViewer: async () => state.viewer,
    isProfileBlocked: async () => false,
    withPermission,
    withPermissionExempt: withPermission,
  };
});

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

function person(roleKeys: string[], affiliation: "verified" | null = null, extra: Permission[] = []) {
  const overrides = extra.map((permission) => ({ permission, effect: "grant" as const }));
  const sheet = resolveSheetEntitlement({ mode: "enforcing", roleKeys, rolePermissions, overrides, affiliation });
  const permissions = projectSheetPermission(resolvePermissions(roleKeys, rolePermissions, overrides), sheet);
  return {
    userId: "user_test",
    env: "development",
    roleKeys,
    permissions,
    explicit: permissions,
    sheet,
    canAccessAdmin: false,
    can: (permission: Permission) => permissions.has(permission),
  };
}

const POST = (body: unknown = {}) => new Request("https://example.test/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const FORBIDDEN = "You do not have permission to do that.";

describe.each([
  ["a Member", () => person([])],
  ["a verified Church Member", () => person([], "verified")],
])("%s", (_name, who) => {
  beforeEach(() => {
    state.viewer = who();
    state.invite.mockReset();
  });

  it("holds no music-team permission", () => {
    const viewer = who();
    for (const permission of ["view_availability", "manage_availability", "lead_songs", "view_service_plans", "manage_service_plans", "manage_sheet_music", "use_ai"] as const) {
      expect(viewer.can(permission), permission).toBe(false);
    }
  });

  it("cannot read or change availability through the API", async () => {
    const route = await import("@/app/api/account/availability/route");
    expect((await route.GET()).status).toBe(403);
    expect((await route.POST(POST())).status).toBe(403);
  });

  it("cannot read song leader assignments", async () => {
    const { GET } = await import("@/app/api/account/song-leaders/route");
    const body = (await (await GET()).json()) as { authorized?: boolean; leaders?: unknown[] };
    expect(body.authorized).toBe(false);
    expect(body.leaders ?? []).toEqual([]);
  });

  it("cannot export internal service plans", async () => {
    const { GET } = await import("@/app/service-planner/export/route");
    expect((await GET(new Request("https://example.test/service-planner/export?format=pdf"))).status).toBe(403);
  });

  it("cannot invoke the planner's AI", async () => {
    const { POST: run } = await import("@/app/api/service-planner/ai/route");
    expect((await run(POST())).status).toBe(403);
  });

  it("cannot invoke Conductor", async () => {
    const { POST: run } = await import("@/app/api/conductor/route");
    expect((await run(POST())).status).toBe(403);
  });

  it("cannot change availability through server actions", async () => {
    const actions = await import("@/app/availability/actions");
    for (const action of [actions.setServiceAvailability, actions.setRangeAvailability, actions.setNormalPattern]) {
      expect(await action({})).toEqual({ ok: false, error: FORBIDDEN });
    }
  });

  it("cannot change service plans through server actions", async () => {
    const actions = await import("@/app/service-planner/actions");
    for (const action of [actions.publishServices, actions.setServiceStatus, actions.createSpecialService, actions.deleteSpecialService, actions.setInsertWeek]) {
      expect(await action({})).toMatchObject({ ok: false, error: FORBIDDEN });
    }
  });

  it("cannot use any administrative action", async () => {
    const actions = await import("@/app/admin/actions");
    expect(await actions.inviteAction("a@example.com", [], true)).toEqual({ ok: false, error: FORBIDDEN });
    expect(await actions.setChurchAffiliationAction("user_2abc", null, "verified", "")).toEqual({ ok: false, error: FORBIDDEN });
    expect(await actions.activateSheetAccessAction("hash")).toEqual({ ok: false, error: FORBIDDEN });
    expect(await actions.rollbackSheetAccessAction()).toEqual({ ok: false, error: FORBIDDEN });
    expect(state.invite).not.toHaveBeenCalled();
  });
});

describe("the people who should keep access", () => {
  it.each([
    ["musician", ["view_availability", "view_service_plans", "view_sheet_music"]],
    ["song_leader", ["lead_songs", "view_availability", "view_service_plans", "view_sheet_music"]],
    ["music_director", ["manage_service_plans", "manage_sheet_music", "view_sheet_music", "use_ai"]],
    ["administrator", ["manage_users", "manage_roles", "manage_service_plans", "view_sheet_music", "use_ai"]],
  ] as const)("%s keeps its permissions", (role, expected) => {
    const viewer = person([role]);
    for (const permission of expected) expect(viewer.can(permission), permission).toBe(true);
  });

  it("does not make a Song Leader a Musician", () => {
    expect(person(["song_leader"]).roleKeys).not.toContain("musician");
  });
});

describe("Manage users without Manage roles", () => {
  beforeEach(() => {
    state.viewer = person([], null, ["manage_users"]);
    state.invite.mockReset();
  });

  it("cannot choose roles on an invitation, and nothing is sent", async () => {
    const { inviteAction } = await import("@/app/admin/actions");
    const result = await inviteAction("a@example.com", ["musician"]);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Manage roles") });
    expect(state.invite).not.toHaveBeenCalled();
  });

  it("cannot choose roles when approving a request", async () => {
    const { approveRequestAction } = await import("@/app/admin/actions");
    expect(await approveRequestAction(1, ["administrator"], true)).toMatchObject({ ok: false, error: expect.stringContaining("Manage roles") });
    expect(state.invite).not.toHaveBeenCalled();
  });

  it("cannot assign roles or individual permissions", async () => {
    const { setOverrideAction, setUserRolesAction } = await import("@/app/admin/actions");
    expect(await setUserRolesAction("user_2abc", [{ roleKey: "musician", assigned: true }])).toEqual({ ok: false, error: FORBIDDEN });
    expect(await setOverrideAction("user_2abc", { permission: "view_sheet_music", effect: "grant", note: "" })).toEqual({ ok: false, error: FORBIDDEN });
  });

  it("cannot activate sheet access", async () => {
    const { activateSheetAccessAction } = await import("@/app/admin/actions");
    expect(await activateSheetAccessAction("hash")).toEqual({ ok: false, error: FORBIDDEN });
  });
});

describe("Manage roles without being an Administrator", () => {
  beforeEach(() => {
    state.viewer = person([], null, ["manage_roles"]);
  });

  it("cannot activate or roll back", async () => {
    const { activateSheetAccessAction, rollbackSheetAccessAction } = await import("@/app/admin/actions");
    expect(await activateSheetAccessAction("hash")).toEqual({ ok: false, error: FORBIDDEN });
    expect(await rollbackSheetAccessAction()).toEqual({ ok: false, error: FORBIDDEN });
  });

  it("cannot verify church affiliation", async () => {
    const { setChurchAffiliationAction } = await import("@/app/admin/actions");
    expect(await setChurchAffiliationAction("user_2abc", null, "verified", "")).toEqual({ ok: false, error: FORBIDDEN });
  });
});
