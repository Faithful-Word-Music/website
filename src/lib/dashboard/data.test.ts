import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Permission } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";

const calls = vi.hoisted(() => ({ loaded: [] as string[], fail: new Set<string>() }));

function source<T>(name: string, value: T) {
  return async () => {
    calls.loaded.push(name);
    if (calls.fail.has(name)) throw new Error(`${name} is down`);
    return value;
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: source("currentUser", { id: "user_1" }) }));
vi.mock("@/lib/auth/activation", () => ({ activateOwnRequests: source("activate", undefined) }));
vi.mock("@/lib/auth/clerk", () => ({ summarize: () => ({ firstName: "Alex", emails: ["a@example.com"] }) }));
vi.mock("@/lib/auth/session", () => ({ viewerProfileStatus: async () => ({ state: "complete", missing: [] }) }));
vi.mock("@/lib/auth/store", () => ({
  getProfile: source("profile", { preferredName: "Al" }),
  getUserInstruments: source("instruments", [{ label: "Piano", isPrimary: true }]),
  getUserTitles: source("titles", []),
  getSheetMusicTypes: source("sheetTypes", [1]),
  capoRulesOrNone: source("capoRules", {}),
  countRequestsByStatus: source("requests", { pending: 2 }),
}));
vi.mock("@/lib/service-planner/load", () => ({ loadPlannerWork: source("plannerWork", []) }));
vi.mock("./load", () => ({
  loadMusicData: source("music", { services: [], past: [], upcoming: [], index: null, loadedAt: 1 }),
  loadPeople: source("people", { people: [], instrumentCounts: new Map() }),
  loadInvitationFollowUps: source("invitations", { unanswered: [], expired: [] }),
  loadAvailabilitySummary: source("availability", null),
  loadDashboardLeadership: source("leadership", null),
  loadSupportCounts: source("support", null),
}));

function viewer(permissions: Permission[]): Viewer {
  const set = new Set(permissions);
  return { userId: "user_1", env: "development", roleKeys: [], permissions: set, explicit: set, can: (p) => set.has(p), canAccessAdmin: false };
}

beforeEach(() => {
  calls.loaded = [];
  calls.fail = new Set();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadDashboard", () => {
  it("reads only what the viewer's permissions call for", async () => {
    const { loadDashboard } = await import("./data");
    const data = await loadDashboard(viewer(["view_sheet_music"]));
    expect(calls.loaded).not.toContain("people");
    expect(calls.loaded).not.toContain("requests");
    expect(calls.loaded).not.toContain("plannerWork");
    expect(calls.loaded).not.toContain("leadership");
    expect(data.people).toBeNull();
    expect(data.plannerWork).toBeNull();
  });

  it("starts the permission-gated reads for a manager", async () => {
    const { loadDashboard } = await import("./data");
    await loadDashboard(viewer(["manage_users", "manage_service_plans", "manage_sheet_music", "view_profiles"]));
    expect(calls.loaded).toEqual(expect.arrayContaining(["people", "requests", "invitations", "plannerWork", "leadership", "capoRules"]));
  });

  it("still renders when sources fail: each falls back on its own", async () => {
    calls.fail = new Set(["music", "profile", "titles", "activate", "requests", "currentUser"]);
    const { loadDashboard } = await import("./data");
    const data = await loadDashboard(viewer(["manage_users"]));
    expect(data.music.services).toBeNull();
    expect(data.music.past).toEqual([]);
    expect(data.profile).toBeNull();
    expect(data.titles).toEqual([]);
    expect(data.requests).toBeNull();
    expect(data.person).toBeNull();
    // What did load is still there.
    expect(data.instruments).toEqual([{ label: "Piano", isPrimary: true }]);
    expect(data.sheetTypes).toEqual([1]);
  });
});
