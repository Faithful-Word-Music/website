import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewer } from "@/lib/auth/session";
import type { CatalogSong } from "@/lib/service-planner/store";
import type { StoredPlan } from "@/lib/service-planner/model";
import type { DatedService } from "@/types/song-list";

const sources = vi.hoisted(() => ({
  past: [] as DatedService[], published: [] as DatedService[], plans: [] as StoredPlan[], catalog: [] as CatalogSong[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/song-archive", () => ({ loadPast: async () => ({ past: sources.past }) }));
vi.mock("@/lib/schedule", () => ({
  getSchedule: async () => ({ ok: true, published: sources.published, months: [] }),
  scheduleEnv: () => "development",
}));
vi.mock("@/lib/service-planner/store", () => ({
  plannerConfigured: () => true,
  listCatalogSongs: async () => sources.catalog,
  listPlans: async () => sources.plans,
}));
vi.mock("@/lib/sheet-music-index", () => ({ getSheetMusicIndex: async () => ({ ok: false, reason: "unavailable" }) }));

import { loadConductorData } from "./data";
import { songDirectory, songFacts } from "./facts";

const title = "All Hail the Power of Jesus' Name";
const rawUpcoming: DatedService = {
  date: "2026-10-18", slot: "AM", startsAt: "2026-10-18T10:30:00-07:00",
  songs: [{ title, number: "168", key: "Ab" }],
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-16T12:00:00-07:00"));
  sources.past = [{
    date: "2026-10-04", slot: "AM", startsAt: "2026-10-04T10:30:00-07:00",
    songs: [{ songId: "SSSH1989-168", title, number: "168", key: "Ab" }],
  }];
  sources.published = [rawUpcoming];
  sources.catalog = [];
  sources.plans = [{
    id: 1, date: rawUpcoming.date, slot: "AM", kind: "regular", label: null, startsAt: rawUpcoming.startsAt,
    status: "draft", insertMode: "week", slots: [{ ...rawUpcoming.songs[0], insert: false }], revision: 1,
    created: { by: null, at: "2026-10-16T12:00:00-07:00" }, updated: { by: null, at: "2026-10-16T12:00:00-07:00" },
    published: null, publicationId: null,
  }];
});

afterEach(() => vi.restoreAllMocks());

describe("Conductor loader identity during an index outage", () => {
  it.each([false, true])("uses stored associations before identifying raw upcoming songs (planner access: %s)", async (canPlan) => {
    const viewer: Viewer = {
      userId: "director", env: "development", roleKeys: [], permissions: new Set(), canAccessAdmin: false,
      can: (permission) => permission === "use_ai" || (canPlan && permission === "manage_service_plans"),
    };
    const loaded = await loadConductorData(viewer);

    expect(loaded.past[0].songs[0].songId).toBe("SSSH1989-168");
    expect(loaded.upcoming[0].songs[0].songId).toBe("SSSH1989-168");
    expect(loaded.draftsIncluded).toBe(canPlan);
    expect(loaded.upcoming[0].status).toBe(canPlan ? "draft" : "published");
    expect(songDirectory(loaded).map((song) => song.id)).toEqual(["SSSH1989-168"]);
    expect(songFacts(loaded, "168")).toMatchObject({
      found: true, timesSung: 1, plannedFor: [{ date: "2026-10-18", status: canPlan ? "draft" : "published" }],
    });
    expect(rawUpcoming.songs[0]).not.toHaveProperty("songId");
  });
});
