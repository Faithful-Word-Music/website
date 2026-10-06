import { describe, expect, it } from "vitest";

import { aiContent } from "@/content/ai";
import { searchContent } from "@/content/search";
import { ALL_PERMISSIONS, DEFAULT_ROLES, canAccessAdmin, resolvePermissions, type Permission } from "@/lib/auth/permissions";

import { ADMIN_SECTIONS, adminPagesFor, adminSectionsFor } from "./admin-sections";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
const role = (...keys: string[]) => resolvePermissions(keys, rolePermissions);
const holding = (...permissions: Permission[]) => new Set<Permission>(permissions);
const hrefs = (permissions: ReadonlySet<Permission>) => adminPagesFor(permissions).map((page) => page.href);

describe("the admin area's sections", () => {
  it("lists every page for an administrator, in the sidebar's order", () => {
    expect(hrefs(role("administrator"))).toEqual([
      "/admin",
      "/admin/requests",
      "/admin/invitations",
      "/admin/users",
      "/admin/roles",
      "/admin/configuration",
      "/admin/notifications",
      "/admin/ai",
      "/admin/ai/memory",
      "/admin/ai/philosophy",
    ]);
  });

  it("gives the Music Director the pages that role's permissions open, and no others", () => {
    expect(hrefs(role("music_director"))).toEqual(["/admin", "/admin/users", "/admin/configuration", "/admin/notifications", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]);
  });

  it("gives a Musician, a Song Leader and a Member nothing", () => {
    for (const key of ["musician", "song_leader", "member"]) {
      expect(adminSectionsFor(role(key))).toEqual([]);
      expect(canAccessAdmin(role(key))).toBe(false);
    }
  });

  it("goes by permissions, not by what a role is called", () => {
    // A role of the site's own making, holding one permission: only what that permission opens.
    expect(hrefs(holding("manage_roles"))).toEqual(["/admin", "/admin/users", "/admin/roles"]);
    expect(hrefs(holding("manage_users"))).toEqual(["/admin", "/admin/requests", "/admin/invitations", "/admin/users"]);
    expect(hrefs(holding("use_ai"))).toEqual(["/admin", "/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]);
    expect(hrefs(holding("manage_sheet_music"))).toEqual(["/admin", "/admin/users", "/admin/configuration"]);
    // Permissions that open nothing in the admin area.
    expect(hrefs(holding("manage_service_plans", "view_availability", "manage_availability", "manage_planning_philosophy"))).toEqual([]);
  });

  it("offers the admin area to exactly the people who can open it", () => {
    for (const permission of ALL_PERMISSIONS) {
      const one = holding(permission);
      expect(adminPagesFor(one).length > 0).toBe(canAccessAdmin(one));
    }
  });

  it("makes AI a group of pages, not a page: it has no address of its own", () => {
    const groups = adminSectionsFor(role("administrator"));
    const ai = groups.flatMap((group) => group.sections).find((section) => section.id === "ai")!;
    expect(ai).not.toHaveProperty("href");
    expect(ai.children?.map((page) => page.label)).toEqual(["Usage", "Memory", "Planning Philosophy"]);
    expect(ai.children?.map((page) => page.href)).toEqual(["/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]);
    expect(aiContent.admin.nav.philosophy).toBe("Planning Philosophy");
  });

  it("drops a group with no page left, and a heading with nothing under it", () => {
    const groups = adminSectionsFor(holding("manage_roles"));
    expect(groups.map((group) => group.label)).toEqual([undefined, "People"]);
    expect(groups.flatMap((group) => group.sections).some((section) => section.id === "ai")).toBe(false);
  });

  it("has words in the search for every page", () => {
    const pages = ADMIN_SECTIONS.flatMap((group) => group.sections.flatMap((section) => section.children ?? [section]));
    for (const page of pages) expect(searchContent.admin[page.id].label).not.toBe("");
    expect(Object.keys(searchContent.admin).sort()).toEqual(pages.map((page) => page.id).sort());
  });
});
