import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission } from "@/lib/auth/permissions";
import {
  SIGNED_OUT,
  accountMenu,
  flatNav,
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
    expect(hrefs(primaryNav(signedIn([], ["manage_service_plans"])))).toEqual(["/dashboard", "/service-planner", "/song-list", "/library", "/contact"]);
    expect(hrefs(primaryNav(signedIn(["musician"])))).not.toContain("/service-planner");
    expect(hrefs(primaryNav(signedIn(["song_leader"])))).not.toContain("/service-planner");
    expect(isMemberPath("/service-planner/2026-10-11-am")).toBe(true);
  });

  it("gathers the Service Planner and Conductor into one Tools menu for someone who may open both", () => {
    const nav = primaryNav(signedIn(["music_director"]));
    expect(nav.map((item) => item.label)).toEqual(["Dashboard", "Tools", "Song List", "Library", "Availability", "Contact"]);
    expect(nav[1].children).toEqual([
      { label: "Service Planner", href: "/service-planner" },
      { label: "Conductor", href: "/conductor" },
    ]);
    // Treated as a link, the menu leads to its first page.
    expect(nav[1].href).toBe("/service-planner");
    expect(hrefs(flatNav(nav))).toEqual([
      "/dashboard",
      "/service-planner",
      "/conductor",
      "/song-list",
      "/library",
      "/availability",
      "/contact",
    ]);
  });

  it("shows one tool as a plain link - never a menu of one - and no menu for none", () => {
    const plannerOnly = primaryNav(signedIn([], ["manage_service_plans"]));
    expect(plannerOnly[1]).toEqual({ label: "Service Planner", href: "/service-planner" });

    const conductorOnly = primaryNav(signedIn([], ["use_ai"]));
    expect(conductorOnly[1]).toEqual({ label: "Conductor", href: "/conductor" });
    expect(hrefs(conductorOnly)).not.toContain("/service-planner");

    const neither = primaryNav(signedIn(["musician"]));
    expect(neither.some((item) => item.children)).toBe(false);
    expect(neither.map((item) => item.label)).not.toContain("Tools");
  });

  it("offers Conductor only to someone holding use_ai", () => {
    for (const role of ["musician", "song_leader", "member"]) {
      expect(hrefs(flatNav(primaryNav(signedIn([role]))))).not.toContain("/conductor");
    }
    expect(hrefs(flatNav(primaryNav(signedIn(["administrator"]))))).toContain("/conductor");
    expect(isMemberPath("/conductor")).toBe(true);
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

  it("holds Notifications, Profile and Account settings - not the Dashboard - with no Admin for a member", () => {
    expect(hrefs(accountMenu(signedIn(["musician"])))).toEqual(["/notifications", "/profile", "/account"]);
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
