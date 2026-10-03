import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission } from "@/lib/auth/permissions";
import {
  SIGNED_OUT,
  accountMenu,
  homeHref,
  isActivePath,
  isMemberPath,
  primaryNav,
  type NavContext,
} from "@/lib/navigation";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

function signedIn(roleKeys: string[], extra: Permission[] = []): NavContext {
  const permissions = resolvePermissions(roleKeys, rolePermissions, extra.map((permission) => ({ permission, effect: "grant" })));
  return { signedIn: true, permissions };
}

const hrefs = (items: Array<{ href: string }>) => items.map((item) => item.href);

describe("primaryNav", () => {
  it("shows visitors the public site", () => {
    expect(hrefs(primaryNav(SIGNED_OUT))).toEqual(["/", "/song-list", "/library", "/contact"]);
  });

  it("puts the Dashboard in Home's place for a signed-in member", () => {
    expect(hrefs(primaryNav(signedIn([])))).toEqual(["/dashboard", "/song-list", "/library", "/contact"]);
  });

  it("shows the music ministry's participants Availability, after the Song List and Library", () => {
    for (const role of ["musician", "song_leader"]) {
      expect(hrefs(primaryNav(signedIn([role])))).toEqual(["/dashboard", "/song-list", "/library", "/availability", "/contact"]);
    }
  });

  it("puts the Service Planner right after the Dashboard for whoever manages service plans", () => {
    expect(hrefs(primaryNav(signedIn(["music_director"])))).toEqual([
      "/dashboard",
      "/service-planner",
      "/song-list",
      "/library",
      "/availability",
      "/contact",
    ]);
    expect(hrefs(primaryNav(signedIn(["musician"])))).not.toContain("/service-planner");
    expect(hrefs(primaryNav(signedIn(["song_leader"])))).not.toContain("/service-planner");
    expect(hrefs(primaryNav(signedIn([], ["manage_service_plans"])))).toContain("/service-planner");
    expect(isMemberPath("/service-planner/2026-10-11-am")).toBe(true);
  });

  it("does not show Availability to a Member-only account", () => {
    expect(hrefs(primaryNav(signedIn([])))).not.toContain("/availability");
    expect(hrefs(primaryNav(signedIn(["member"])))).not.toContain("/availability");
  });

  it("follows the permission: a custom role or a grant of view_availability shows it", () => {
    expect(hrefs(primaryNav(signedIn([], ["view_availability"])))).toContain("/availability");
  });

  it("works before the person's permissions are known", () => {
    expect(hrefs(primaryNav({ signedIn: true, permissions: new Set() }))[0]).toBe("/dashboard");
  });
});

describe("accountMenu", () => {
  it("is empty for visitors", () => {
    expect(accountMenu(SIGNED_OUT)).toEqual([]);
  });

  it("keeps Dashboard, Profile and Account settings apart, with no Admin for a member", () => {
    expect(hrefs(accountMenu(signedIn(["musician"])))).toEqual(["/dashboard", "/profile", "/account"]);
  });

  it("adds Admin for an administrator", () => {
    expect(hrefs(accountMenu(signedIn(["administrator"])))).toContain("/admin");
  });

  it("follows the permission, not the role name: a custom role with manage_users gets Admin", () => {
    expect(hrefs(accountMenu(signedIn([], ["manage_users"])))).toContain("/admin");
  });

  it("does not offer editing in the menu - that lives on the Profile page", () => {
    expect(hrefs(accountMenu(signedIn(["administrator"])))).not.toContain("/profile/edit");
  });
});

describe("homeHref", () => {
  it("is the Dashboard once signed in", () => {
    expect(homeHref(SIGNED_OUT)).toBe("/");
    expect(homeHref(signedIn([]))).toBe("/dashboard");
  });
});

describe("isMemberPath", () => {
  it("knows the pages only a signed-in person can open", () => {
    expect(isMemberPath("/dashboard")).toBe(true);
    expect(isMemberPath("/availability")).toBe(true);
    expect(isMemberPath("/profile/edit")).toBe(true);
    expect(isMemberPath("/admin/users/user_1")).toBe(true);
    expect(isMemberPath("/")).toBe(false);
    expect(isMemberPath("/song-list")).toBe(false);
    expect(isMemberPath("/accounts")).toBe(false);
  });
});

describe("isActivePath", () => {
  it("matches the page and pages inside it, but not look-alike paths", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/song-list", "/")).toBe(false);
    expect(isActivePath("/song-list/archive", "/song-list")).toBe(true);
    expect(isActivePath("/profile/edit", "/profile")).toBe(true);
    expect(isActivePath("/dashboards", "/dashboard")).toBe(false);
  });
});
