import { beforeEach, describe, expect, it, vi } from "vitest";

import { planSong, type StoredPlan } from "@/lib/service-planner/model";

/**
 * The schedule's shared cache (src/lib/schedule.ts): what goes into it, and
 * that the song list built from it is the one built from the database.
 */

vi.mock("server-only", () => ({}));
// The cache itself is Next's; here every call reads straight through.
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));

const store = vi.hoisted(() => ({
  listPlans: vi.fn(),
  listInsertWeeks: vi.fn(),
  plannerConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/service-planner/store", () => store);

const { getSchedule, loadScheduleRows } = await import("./schedule");

function plan(date: string, status: StoredPlan["status"], title: string): StoredPlan {
  const stamp = { by: "user_1", at: "2026-10-01T00:00:00.000Z" };
  return {
    id: Math.floor(Math.random() * 1e6),
    date,
    slot: "AM",
    kind: "regular",
    label: null,
    startsAt: `${date}T10:30:00-05:00`,
    status,
    insertMode: status === "draft" ? "custom" : "week",
    slots: [planSong({ title, number: "100", key: "G" })],
    revision: 1,
    created: stamp,
    updated: stamp,
    published: status === "published" ? stamp : null,
    publicationId: null,
  };
}

beforeEach(() => {
  store.listPlans.mockResolvedValue([
    plan("2026-10-04", "published", "Amazing Grace"),
    plan("2026-10-11", "cancelled", "Cancelled Song"),
    plan("2026-10-18", "draft", "Secret Draft Song"),
  ]);
  store.listInsertWeeks.mockResolvedValue([]);
});

describe("loadScheduleRows", () => {
  it("keeps a draft's insert mode and nothing else", async () => {
    const rows = await loadScheduleRows("production", "2026-09-27");
    expect(rows.drafts).toEqual([{ date: "2026-10-18", slot: "AM", insertMode: "custom" }]);
    expect(JSON.stringify(rows)).not.toContain("Secret Draft Song");
    expect(rows.plans.map((row) => row.status)).toEqual(["published", "cancelled"]);
  });
});

describe("getSchedule", () => {
  it("publishes only published songs", async () => {
    const result = await getSchedule();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.published.map((service) => service.date)).toEqual(["2026-10-04"]);
    expect(JSON.stringify(result)).not.toContain("Secret Draft Song");
    expect(JSON.stringify(result)).not.toContain("Cancelled Song");
  });
});
