import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions } from "@/lib/auth/permissions";
import { buildFocus } from "@/lib/dashboard/focus";
import { servicePlannerAttention, type PlannerWork } from "@/lib/dashboard/providers";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
const focusFor = (roles: string[]) =>
  buildFocus({ roleKeys: roles, permissions: resolvePermissions(roles, rolePermissions, []), titles: [], instruments: [] });

const work: PlannerWork[] = [
  { anchor: "2026-10-11-pm", slot: "PM", startsAt: "2026-10-11T18:00:00-07:00", label: null, status: "draft", filled: 3, target: 5 },
  { anchor: "2026-10-14-pm", slot: "PM", startsAt: "2026-10-14T19:00:00-07:00", label: null, status: "not-started", filled: 0, target: 5 },
];
const now = Date.parse("2026-10-10T09:00:00-07:00");

describe("servicePlannerAttention", () => {
  it("points the Music Director at the next service to plan, and the rest", () => {
    const items = servicePlannerAttention(focusFor(["music_director"]), work, now);
    expect(items[0]).toMatchObject({
      id: "planner:next",
      priority: "urgent",
      title: "Sunday Evening · Sun, Oct 11 - Draft · 3 of 5 songs",
      href: "/service-planner/2026-10-11-pm",
    });
    expect(items[1]).toMatchObject({ id: "planner:queue", title: "2 services need planning", href: "/service-planner" });
  });

  it("is not urgent while the next service is days away", () => {
    expect(servicePlannerAttention(focusFor(["music_director"]), work, Date.parse("2026-10-05T09:00:00-07:00"))[0].priority).toBe(
      "normal",
    );
  });

  it("says nothing to musicians and song leaders, or when everything is planned", () => {
    expect(servicePlannerAttention(focusFor(["musician"]), work, now)).toEqual([]);
    expect(servicePlannerAttention(focusFor(["song_leader"]), work, now)).toEqual([]);
    expect(servicePlannerAttention(focusFor(["music_director"]), [], now)).toEqual([]);
  });
});
