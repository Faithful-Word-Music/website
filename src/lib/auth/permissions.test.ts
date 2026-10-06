import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLE,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSION_FIXUPS,
  canAccessAdmin,
  fixupGrants,
  resolvePermissions,
  roleKeyFromLabel,
} from "@/lib/auth/permissions";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

describe("resolvePermissions", () => {
  it("gives every signed-in person the Member role's permissions, sheet music included", () => {
    expect([...resolvePermissions([], rolePermissions)].sort()).toEqual(["view_member_resources", "view_sheet_music"]);
  });

  it("adds up permissions across several roles", () => {
    const permissions = resolvePermissions(["musician", "song_leader"], rolePermissions);
    expect(permissions.has("view_sheet_music")).toBe(true);
    expect(permissions.has("view_service_plans")).toBe(true);
    expect(permissions.has("manage_users")).toBe(false);
  });

  it("gives an administrator everything, whatever the database says", () => {
    const permissions = resolvePermissions([ADMIN_ROLE], new Map());
    expect(permissions.size).toBe(ALL_PERMISSIONS.length);
  });

  it("applies individual grants and denies on top of roles", () => {
    const permissions = resolvePermissions(["musician"], rolePermissions, [
      { permission: "view_analytics", effect: "grant" },
      { permission: "view_sheet_music", effect: "deny" },
    ]);
    expect(permissions.has("view_analytics")).toBe(true);
    expect(permissions.has("view_sheet_music")).toBe(false);
    expect(permissions.has("view_service_plans")).toBe(true);
  });

  it("never lets an exception lock an administrator out of managing users and roles", () => {
    const permissions = resolvePermissions([ADMIN_ROLE], rolePermissions, [
      { permission: "manage_users", effect: "deny" },
      { permission: "manage_roles", effect: "deny" },
      { permission: "view_analytics", effect: "deny" },
    ]);
    expect(permissions.has("manage_users")).toBe(true);
    expect(permissions.has("manage_roles")).toBe(true);
    expect(permissions.has("view_analytics")).toBe(false);
  });

  it("ignores permissions and roles it does not know", () => {
    const permissions = resolvePermissions(["no_such_role"], new Map([["no_such_role", ["launch_rockets"]]]), [
      { permission: "launch_rockets", effect: "grant" },
    ]);
    expect([...permissions]).toEqual([]);
  });
});

describe("canAccessAdmin", () => {
  it("is true only with an admin-area permission", () => {
    expect(canAccessAdmin(resolvePermissions(["musician"], rolePermissions))).toBe(false);
    expect(canAccessAdmin(resolvePermissions(["song_leader"], rolePermissions))).toBe(false);
    expect(canAccessAdmin(resolvePermissions([ADMIN_ROLE], rolePermissions))).toBe(true);
    // Through manage_sheet_music: each person's sheet music is chosen on their People page.
    expect(canAccessAdmin(resolvePermissions(["music_director"], rolePermissions))).toBe(true);
    expect(
      canAccessAdmin(resolvePermissions(["musician"], rolePermissions, [{ permission: "view_profiles", effect: "grant" }])),
    ).toBe(true);
    // AI's status and usage live in the admin area (/admin/ai).
    expect(
      canAccessAdmin(resolvePermissions(["musician"], rolePermissions, [{ permission: "use_ai", effect: "grant" }])),
    ).toBe(true);
  });
});

describe("AI permission", () => {
  it("is held by administrators and the Music Director, and nobody else", () => {
    const has = (roleKeys: string[]) => resolvePermissions(roleKeys, rolePermissions).has("use_ai");
    expect(has([ADMIN_ROLE])).toBe(true);
    expect(has(["music_director"])).toBe(true);
    expect(has(["song_leader"])).toBe(false);
    expect(has(["musician"])).toBe(false);
    expect(has([])).toBe(false);
  });

  it("is granted once to the existing Music Director role only", () => {
    const fixup = PERMISSION_FIXUPS.find((item) => item.permissions.includes("use_ai"));
    expect(fixup).toBeDefined();
    expect(fixupGrants(fixup!.permissions)).toEqual([{ role: "music_director", permission: "use_ai" }]);
  });
});

describe("notification permissions", () => {
  const holds = (roleKeys: string[], overrides: Parameters<typeof resolvePermissions>[2] = []) => resolvePermissions(roleKeys, rolePermissions, overrides);

  it("are two: sending is not configuring, and either may be held without the other", () => {
    const sends = holds(["musician"], [{ permission: "send_notifications", effect: "grant" }]);
    expect(sends.has("send_notifications")).toBe(true);
    expect(sends.has("manage_notifications")).toBe(false);
    const configures = holds(["musician"], [{ permission: "manage_notifications", effect: "grant" }]);
    expect(configures.has("manage_notifications")).toBe(true);
    expect(configures.has("send_notifications")).toBe(false);
    // Either one opens the admin area, where both live.
    expect(canAccessAdmin(sends)).toBe(true);
    expect(canAccessAdmin(configures)).toBe(true);
  });

  it("are both held by administrators and the Music Director, and by nobody else", () => {
    for (const permission of ["send_notifications", "manage_notifications"] as const) {
      expect(holds([ADMIN_ROLE]).has(permission)).toBe(true);
      expect(holds(["music_director"]).has(permission)).toBe(true);
      expect(holds(["song_leader"]).has(permission)).toBe(false);
      expect(holds(["musician"]).has(permission)).toBe(false);
      expect(holds([]).has(permission)).toBe(false);
    }
  });

  it("can be taken from a Music Director by an exception", () => {
    expect(holds(["music_director"], [{ permission: "send_notifications", effect: "deny" }]).has("send_notifications")).toBe(false);
  });

  it("gives sending once to the existing Music Director role only, in a fix-up of its own", () => {
    const fixup = PERMISSION_FIXUPS.find((item) => item.permissions.includes("send_notifications"));
    expect(fixup).toBeDefined();
    expect(fixupGrants(fixup!.permissions)).toEqual([{ role: "music_director", permission: "send_notifications" }]);
    // Its own key: the fix-up that gave manage_notifications has already run on existing sites and would not run again.
    expect(fixup!.key).not.toBe(PERMISSION_FIXUPS.find((item) => item.permissions.includes("manage_notifications"))!.key);
    expect(new Set(PERMISSION_FIXUPS.map((item) => item.key)).size).toBe(PERMISSION_FIXUPS.length);
  });
});

describe("AI memory and planning philosophy permissions", () => {
  const AI_EXTRAS = ["use_personal_ai_memory", "manage_global_ai_memory", "manage_planning_philosophy"] as const;

  it("are held by administrators and the Music Director, and nobody else by default", () => {
    for (const permission of AI_EXTRAS) {
      const has = (roleKeys: string[]) => resolvePermissions(roleKeys, rolePermissions).has(permission);
      expect(has([ADMIN_ROLE])).toBe(true);
      expect(has(["music_director"])).toBe(true);
      expect(has(["song_leader"])).toBe(false);
      expect(has(["musician"])).toBe(false);
      expect(has([])).toBe(false);
    }
  });

  it("are separate: personal memory can be given without shared memory or use_ai itself", () => {
    const permissions = resolvePermissions(["musician"], rolePermissions, [
      { permission: "use_ai", effect: "grant" },
      { permission: "use_personal_ai_memory", effect: "grant" },
    ]);
    expect(permissions.has("use_personal_ai_memory")).toBe(true);
    expect(permissions.has("manage_global_ai_memory")).toBe(false);
    expect(permissions.has("manage_planning_philosophy")).toBe(false);
  });

  it("are granted once to the existing Music Director role only", () => {
    const fixup = PERMISSION_FIXUPS.find((item) => item.permissions.includes("manage_global_ai_memory"));
    expect(fixup).toBeDefined();
    expect(fixupGrants(fixup!.permissions)).toEqual(AI_EXTRAS.map((permission) => ({ role: "music_director", permission })));
  });
});

describe("roleKeyFromLabel", () => {
  it("makes a stable lowercase key", () => {
    expect(roleKeyFromLabel("Assistant Director")).toBe("assistant_director");
    expect(roleKeyFromLabel("  Choir -- Alto! ")).toBe("choir_alto");
    expect(roleKeyFromLabel("!!!")).toBe("");
  });
});

describe("availability permissions", () => {
  it("gives participants view_availability and only the Music Director manage_availability", () => {
    const has = (roleKeys: string[], permission: "view_availability" | "manage_availability") =>
      resolvePermissions(roleKeys, rolePermissions).has(permission);
    expect(has(["musician"], "view_availability")).toBe(true);
    expect(has(["song_leader"], "view_availability")).toBe(true);
    expect(has(["music_director"], "view_availability")).toBe(true);
    expect(has(["music_director"], "manage_availability")).toBe(true);
    expect(has(["musician"], "manage_availability")).toBe(false);
    expect(has([], "view_availability")).toBe(false);
  });

  it("grants them once to the existing built-in roles that should have them", () => {
    const fixup = PERMISSION_FIXUPS.find((item) => item.permissions.includes("view_availability"));
    expect(fixup).toBeDefined();
    expect(fixupGrants(fixup!.permissions)).toEqual([
      { role: "music_director", permission: "view_availability" },
      { role: "music_director", permission: "manage_availability" },
      { role: "song_leader", permission: "view_availability" },
      { role: "musician", permission: "view_availability" },
    ]);
  });
});
