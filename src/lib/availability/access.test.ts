import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission, type PermissionOverride } from "@/lib/auth/permissions";
import {
  availabilityRosterIds,
  availabilityTarget,
  isAvailabilityParticipant,
  isEditable,
} from "@/lib/availability/access";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

function viewerWith(userId: string, roleKeys: string[], overrides: PermissionOverride[] = []) {
  const permissions = resolvePermissions(roleKeys, rolePermissions, overrides);
  return { userId, can: (permission: Permission) => permissions.has(permission) };
}

describe("isAvailabilityParticipant", () => {
  it("includes musicians, song leaders and the music director", () => {
    expect(isAvailabilityParticipant(["musician"], rolePermissions)).toBe(true);
    expect(isAvailabilityParticipant(["song_leader"], rolePermissions)).toBe(true);
    expect(isAvailabilityParticipant(["music_director"], rolePermissions)).toBe(true);
  });

  it("leaves out a Member-only account", () => {
    expect(isAvailabilityParticipant([], rolePermissions)).toBe(false);
    expect(isAvailabilityParticipant(["member"], rolePermissions)).toBe(false);
  });

  it("does not list an administrator for holding every permission", () => {
    expect(isAvailabilityParticipant(["administrator"], rolePermissions)).toBe(false);
    expect(isAvailabilityParticipant(["administrator", "musician"], rolePermissions)).toBe(true);
  });

  it("follows permissions, not role names: grants and denies count", () => {
    expect(isAvailabilityParticipant(["helper"], new Map([["helper", ["view_availability"]]]))).toBe(true);
    expect(isAvailabilityParticipant([], rolePermissions, [{ permission: "view_availability", effect: "grant" }])).toBe(true);
    expect(isAvailabilityParticipant(["musician"], rolePermissions, [{ permission: "view_availability", effect: "deny" }])).toBe(
      false,
    );
  });
});

describe("availabilityRosterIds", () => {
  it("builds the shared board from roles and individual exceptions", () => {
    const userRoles = new Map([
      ["user_alex", ["musician"]],
      ["user_john", ["song_leader"]],
      ["user_director", ["music_director"]],
      ["user_admin", ["administrator"]],
      ["user_member", ["member"]],
      ["user_denied", ["musician"]],
    ]);
    const overrides = new Map<string, PermissionOverride[]>([
      ["user_denied", [{ permission: "view_availability", effect: "deny" }]],
      ["user_guest", [{ permission: "view_availability", effect: "grant" }]],
    ]);
    expect(availabilityRosterIds(userRoles, rolePermissions, overrides).sort()).toEqual([
      "user_alex",
      "user_director",
      "user_guest",
      "user_john",
    ]);
  });
});

describe("availabilityTarget", () => {
  const roster = new Set(["user_alex", "user_john", "user_director"]);

  it("lets a participant manage their own records, taking the ID from the session", () => {
    const alex = viewerWith("user_alex", ["musician"]);
    expect(availabilityTarget(alex, undefined, roster)).toEqual({ kind: "self", userId: "user_alex" });
    expect(availabilityTarget(alex, "user_alex", roster)).toEqual({ kind: "self", userId: "user_alex" });
  });

  it("refuses a participant changing someone else's records", () => {
    const alex = viewerWith("user_alex", ["musician"]);
    expect(availabilityTarget(alex, "user_john", roster)).toEqual({ kind: "forbidden", reason: "not-a-leader" });
  });

  it("lets the music director manage another participant", () => {
    const director = viewerWith("user_director", ["music_director"]);
    expect(availabilityTarget(director, "user_john", roster)).toEqual({ kind: "other", userId: "user_john" });
  });

  it("treats the music director's own availability like anyone else's", () => {
    const director = viewerWith("user_director", ["music_director"]);
    expect(availabilityTarget(director, undefined, roster)).toEqual({ kind: "self", userId: "user_director" });
  });

  it("refuses a leader targeting someone not on the board", () => {
    const director = viewerWith("user_director", ["music_director"]);
    expect(availabilityTarget(director, "user_member", roster)).toEqual({ kind: "forbidden", reason: "unknown-person" });
  });

  it("refuses changes to the viewer's own records when they are not on the board", () => {
    const admin = viewerWith("user_admin", ["administrator"]);
    expect(availabilityTarget(admin, undefined, roster)).toEqual({ kind: "forbidden", reason: "not-on-board" });
    // ...but an administrator may still manage people who are.
    expect(availabilityTarget(admin, "user_alex", roster)).toEqual({ kind: "other", userId: "user_alex" });
  });
});

describe("isEditable", () => {
  it("allows changes until the service starts", () => {
    const service = { startsAt: "2026-10-18T10:30:00-07:00" };
    expect(isEditable(service, Date.parse("2026-10-18T10:29:00-07:00"))).toBe(true);
    expect(isEditable(service, Date.parse("2026-10-18T10:30:00-07:00"))).toBe(false);
  });
});
