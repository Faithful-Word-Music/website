import { describe, expect, it } from "vitest";

import { currentHref, insideGroup, isGroupOpen, toggleGroup, type GroupToggles, type NavGroup } from "./current-href";

const sections = [{ href: "/admin" }, { href: "/admin/users" }, { href: "/admin/roles" }];

/** The admin area's AI group: three pages, the first at the group's own address. */
const ai: NavGroup = { id: "ai", children: [{ href: "/admin/ai" }, { href: "/admin/ai/memory" }, { href: "/admin/ai/philosophy" }] };

describe("currentHref", () => {
  it("is the longest address the page is in", () => {
    expect(currentHref(sections, "/admin")).toBe("/admin");
    expect(currentHref(sections, "/admin/users")).toBe("/admin/users");
    expect(currentHref(sections, "/admin/users/user_123")).toBe("/admin/users");
    expect(currentHref(sections, "/admin/roles/musician")).toBe("/admin/roles");
  });

  it("does not take one address for another that merely starts the same way", () => {
    expect(currentHref([{ href: "/admin/ai" }], "/admin/airport")).toBeUndefined();
    expect(currentHref(sections, "/dashboard")).toBeUndefined();
  });

  it("keeps a feature's section open on the pages inside it, as SectionNav needs", () => {
    const planner = [{ href: "/service-planner" }, { href: "/service-planner/inserts" }, { href: "/song-list/archive/services" }];
    expect(currentHref(planner, "/service-planner")).toBe("/service-planner");
    expect(currentHref(planner, "/service-planner/2026-10-11-am")).toBe("/service-planner");
    expect(currentHref(planner, "/service-planner/inserts")).toBe("/service-planner/inserts");
    expect(currentHref(planner, "/song-list/archive/services/2026-10-04-am")).toBe("/song-list/archive/services");
    // The Archive's own two views: the longer address wins on the page they share a start with.
    const archive = [{ href: "/song-list/archive" }, { href: "/song-list/archive/services" }];
    expect(currentHref(archive, "/song-list/archive")).toBe("/song-list/archive");
    expect(currentHref(archive, "/song-list/archive/services")).toBe("/song-list/archive/services");
  });

  it("tells a group's pages apart, the first one included", () => {
    expect(currentHref(ai.children, "/admin/ai")).toBe("/admin/ai");
    expect(currentHref(ai.children, "/admin/ai/memory")).toBe("/admin/ai/memory");
    expect(currentHref(ai.children, "/admin/ai/philosophy")).toBe("/admin/ai/philosophy");
  });
});

describe("a group that opens", () => {
  const none: GroupToggles = {};

  it("knows whether the page is one of its own", () => {
    expect(insideGroup(ai, "/admin/ai")).toBe(true);
    expect(insideGroup(ai, "/admin/ai/memory")).toBe(true);
    expect(insideGroup(ai, "/admin/roles")).toBe(false);
    expect(insideGroup(ai, "/admin")).toBe(false);
  });

  it("starts open on any of its own pages, and closed everywhere else", () => {
    for (const page of ["/admin/ai", "/admin/ai/memory", "/admin/ai/philosophy"]) expect(isGroupOpen(ai, page, none)).toBe(true);
    for (const page of ["/admin", "/admin/roles", "/admin/users/user_1"]) expect(isGroupOpen(ai, page, none)).toBe(false);
  });

  it("opens from another page when pressed, without the page changing, and closes when pressed again", () => {
    const opened = toggleGroup(ai, "/admin/roles", none);
    expect(isGroupOpen(ai, "/admin/roles", opened)).toBe(true);
    // Still open on another page outside it: the person is looking, and has not chosen yet.
    expect(isGroupOpen(ai, "/admin/users", opened)).toBe(true);
    const closed = toggleGroup(ai, "/admin/roles", opened);
    expect(isGroupOpen(ai, "/admin/roles", closed)).toBe(false);
  });

  it("can be closed on one of its own pages, and stays closed while moving between them", () => {
    const closed = toggleGroup(ai, "/admin/ai/memory", none);
    expect(isGroupOpen(ai, "/admin/ai/memory", closed)).toBe(false);
    expect(isGroupOpen(ai, "/admin/ai/philosophy", closed)).toBe(false);
    expect(isGroupOpen(ai, "/admin/ai/memory", toggleGroup(ai, "/admin/ai/memory", closed))).toBe(true);
  });

  it("starts again when the person goes into it or out of it", () => {
    // Opened from Roles, then one of its pages chosen: open, as any of its pages shows it.
    const opened = toggleGroup(ai, "/admin/roles", none);
    expect(isGroupOpen(ai, "/admin/ai/memory", opened)).toBe(true);
    // Closed while inside, then left: closed, as it is from anywhere outside...
    const closed = toggleGroup(ai, "/admin/ai/memory", none);
    expect(isGroupOpen(ai, "/admin/roles", closed)).toBe(false);
    // ...and coming back to one of its pages shows them again, whatever was done before leaving.
    expect(isGroupOpen(ai, "/admin/ai", toggleGroup(ai, "/admin/roles", toggleGroup(ai, "/admin/roles", closed)))).toBe(true);
    // Opened from outside, gone in, come back out: folded again.
    expect(isGroupOpen(ai, "/admin/roles", toggleGroup(ai, "/admin/ai", opened))).toBe(false);
  });

  it("keeps each group's state to itself", () => {
    const other: NavGroup = { id: "reports", children: [{ href: "/admin/reports" }] };
    const opened = toggleGroup(ai, "/admin/roles", none);
    expect(isGroupOpen(other, "/admin/roles", opened)).toBe(false);
    expect(isGroupOpen(ai, "/admin/roles", toggleGroup(other, "/admin/roles", opened))).toBe(true);
  });
});
