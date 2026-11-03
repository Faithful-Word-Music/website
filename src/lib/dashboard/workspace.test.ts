import { describe, expect, it } from "vitest";

import type { Permission } from "@/lib/auth/permissions";
import type { MyAssignment } from "@/lib/leadership/board";

import type { AttentionItem } from "./attention";
import type { ComingUpService, ComingUpSong } from "./coming-up";
import { buildFocus, type DashboardFocus } from "./focus";
import type { Rosters } from "./leadership";
import type { PlannerWork } from "./providers";
import {
  buildHero,
  buildLater,
  FOR_YOU_LIMIT,
  heroCoveredIds,
  readinessTone,
  servicePlaylistHref,
  splitForYou,
  teamAvailabilityRows,
  teamTools,
  type WorkspaceInput,
} from "./workspace";

const DAY = 86_400_000;
const now = Date.parse("2026-11-02T12:00:00-07:00");
const inDays = (days: number) => new Date(now + days * DAY).toISOString();

function focusWith(...permissions: Permission[]): DashboardFocus {
  return buildFocus({ roleKeys: [], permissions: new Set(permissions), titles: [], instruments: [] });
}

const song = (title = "Amazing Grace"): ComingUpSong => ({ title, number: "245", key: "G", sheet: null });

function service(overrides: Partial<ComingUpService> = {}): ComingUpService {
  return {
    id: "2026-11-08-am",
    status: "next",
    date: "2026-11-08",
    slot: "AM",
    dateLabel: "Sunday, November 8",
    serviceLabel: "Morning Service",
    startsAt: inDays(6),
    slots: [song(), song("How Great Thou Art")],
    packetHref: null,
    packetSongs: [],
    showLabels: false,
    sheetMusicChecked: false,
    packetTypes: [],
    plannedInserts: [],
    ...overrides,
  };
}

const work = (overrides: Partial<PlannerWork> = {}): PlannerWork => ({
  anchor: "2026-11-08-am", slot: "AM", startsAt: inDays(6), label: null, status: "draft", filled: 3, target: 5, ...overrides,
});

function assignment(overrides: Partial<MyAssignment> = {}): MyAssignment {
  return {
    anchor: "2026-11-22-pm", date: "2026-11-22", slot: "PM", startsAt: inDays(20), label: null,
    published: false, positions: [2, 5], songs: null, unavailable: false, ...overrides,
  };
}

function input(overrides: Partial<WorkspaceInput> = {}): WorkspaceInput {
  return { comingUp: [service()], now, focus: focusWith(), plannerWork: null, leading: null, ...overrides };
}

const rosterMine = (anchor: string, mine: number[]): Rosters =>
  new Map([[anchor, { access: "own" as const, mine, places: null, names: [] }]]) as unknown as Rosters;

describe("the hero's primary action", () => {
  it("asks a Music Director to continue planning an unfinished service", () => {
    const hero = buildHero(input({ focus: focusWith("manage_service_plans"), plannerWork: [work()] }));
    expect(hero?.primary).toEqual({ kind: "plan", href: "/service-planner/2026-11-08-am" });
    // Never repeated as a quieter action.
    expect(hero?.secondary.map((action) => action.kind)).toEqual(["song-list"]);
  });

  it("offers a planner the planner as a second action once the service is published", () => {
    const hero = buildHero(input({ focus: focusWith("manage_service_plans"), plannerWork: [] }));
    expect(hero?.primary.kind).toBe("song-list");
    expect(hero?.secondary).toEqual([{ kind: "plan", href: "/service-planner/2026-11-08-am" }]);
  });

  it("opens a musician's sheet music when they have it", () => {
    const hero = buildHero(input({ comingUp: [service({ packetHref: "/dashboard/sheet-music/2026-11-08-am" })] }));
    expect(hero?.primary).toEqual({ kind: "sheet-music" });
    expect(hero?.secondary).toEqual([{ kind: "song-list", href: "/song-list#2026-11-08-am" }]);
  });

  it("sends a leader at a published service to their songs", () => {
    const hero = buildHero(input({ leading: { rosters: rosterMine("2026-11-08-am", [2]), mine: [], problems: [] } }));
    expect(hero?.primary).toEqual({ kind: "review-songs", href: "/song-list#2026-11-08-am" });
  });

  it("does not send a leader to songs that are not posted yet", () => {
    const hero = buildHero(input({ comingUp: [service({ slots: [] })], leading: { rosters: rosterMine("2026-11-08-am", [2]), mine: [], problems: [] } }));
    expect(hero?.primary.kind).toBe("song-list");
    expect(hero?.leaders?.mine).toEqual([2]);
    expect(hero?.leaders?.view).toBeNull();
  });

  it("shows a member the service on the song list", () => {
    expect(buildHero(input())?.primary).toEqual({ kind: "song-list", href: "/song-list#2026-11-08-am" });
  });

  it("has no hero without a service", () => {
    expect(buildHero(input({ comingUp: [] }))).toBeNull();
  });

  it("is deterministic for a multi-role account: planning wins over sheet music", () => {
    const focus = focusWith("manage_service_plans", "manage_users", "manage_sheet_music", "view_sheet_music", "lead_songs");
    const hero = buildHero(
      input({
        focus,
        plannerWork: [work()],
        comingUp: [service({ packetHref: "/dashboard/sheet-music/2026-11-08-am" })],
        leading: { rosters: rosterMine("2026-11-08-am", [1]), mine: [], problems: [] },
      }),
    );
    expect(hero?.primary.kind).toBe("plan");
  });
});

describe("readiness in the workspace", () => {
  it("gives a member no readiness at all - nothing about it is theirs to check", () => {
    expect(buildHero(input())?.readiness).toBeNull();
  });

  it("checks only the viewer's own sheet music for a musician, never the planner's signals", () => {
    const hero = buildHero(input({ comingUp: [service({ sheetMusicChecked: true })] }));
    expect(hero?.readiness?.signals.map((signal) => signal.key)).toEqual(["my-sheet-music"]);
  });

  it("is never ready for a planner when the leaders could not be read", () => {
    const hero = buildHero(input({ focus: focusWith("manage_service_plans"), plannerWork: [], leading: null }));
    expect(hero?.readiness?.overall).toBe("unknown");
    expect(readinessTone("unknown")).toBe("neutral");
  });

  it("maps every state to its tone", () => {
    expect(["ready", "attention", "blocked", "unknown"].map((state) => readinessTone(state as never))).toEqual([
      "success", "warning", "danger", "neutral",
    ]);
  });
});

describe("Later", () => {
  it("lists the services after the next one, then the viewer's leading further ahead, soonest first", () => {
    const rows = buildLater(
      input({
        comingUp: [service(), service({ id: "2026-11-08-pm", slot: "PM", serviceLabel: "Evening Service", startsAt: inDays(6.3), status: "upcoming" })],
        leading: {
          rosters: new Map() as unknown as Rosters,
          mine: [assignment(), assignment({ anchor: "2026-11-08-pm", startsAt: inDays(6.3), published: true, songs: [{ position: 2, title: "Be Thou My Vision", number: "60", key: "Eb" }] })],
          problems: [],
        },
      }),
    );
    expect(rows.map((row) => row.anchor)).toEqual(["2026-11-08-pm", "2026-11-22-pm"]);
    expect(rows[0].leading?.songs?.[0].title).toBe("Be Thou My Vision");
  });

  it("never carries a draft's songs to its leader - positions only", () => {
    const rows = buildLater(
      input({ leading: { rosters: new Map() as unknown as Rosters, mine: [assignment({ songs: [{ position: 2, title: "Draft song", number: null, key: null }] })], problems: [] } }),
    );
    expect(rows[0]).toMatchObject({ published: false, leading: { positions: [2, 5], songs: null } });
  });

  it("is empty when there is nothing after the next service", () => {
    expect(buildLater(input())).toEqual([]);
  });

  it("links a planner to a later service still in their queue, and nobody else", () => {
    const later = service({ id: "2026-11-11-pm", status: "upcoming", startsAt: inDays(9), slots: [] });
    const planner = buildLater(input({ comingUp: [service(), later], focus: focusWith("manage_service_plans"), plannerWork: [work({ anchor: "2026-11-11-pm" })] }));
    expect(planner[0].planHref).toBe("/service-planner/2026-11-11-pm");
    const member = buildLater(input({ comingUp: [service(), later], plannerWork: [work({ anchor: "2026-11-11-pm" })] }));
    expect(member[0].planHref).toBeNull();
  });
});

describe("For You", () => {
  const item = (id: string, priority: AttentionItem["priority"] = "normal"): AttentionItem => ({ id, priority, title: id, href: "/", action: "Open" });

  it("shows five, keeps the rest for See all, and keeps the order it was given", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"].map((id) => item(id));
    const result = splitForYou(items, { complete: true });
    expect(result.shown.map((entry) => entry.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.rest.map((entry) => entry.id)).toEqual(["f", "g"]);
    expect(FOR_YOU_LIMIT).toBe(5);
  });

  it("leaves out the planner's next service when the hero already offers it", () => {
    const hero = buildHero(input({ focus: focusWith("manage_service_plans"), plannerWork: [work()] }));
    const covered = heroCoveredIds(hero, [work()]);
    const result = splitForYou([item("planner:next", "urgent"), item("planner:queue")], { covered, complete: true });
    expect(result.shown.map((entry) => entry.id)).toEqual(["planner:queue"]);
  });

  it("keeps it when the next service to plan is a different one", () => {
    const hero = buildHero(input({ focus: focusWith("manage_service_plans"), plannerWork: [] }));
    expect(heroCoveredIds(hero, [work({ anchor: "2026-11-11-pm" })]).size).toBe(0);
  });

  it("passes on whether every source was read", () => {
    expect(splitForYou([], { complete: false }).complete).toBe(false);
  });
});

describe("playlist links", () => {
  const preparation = { ok: true, months: [{ month: "2026-11", title: "November", services: [{ id: "2026-11-08-am" }] }] } as never;

  it("links a service its playlist has", () => {
    expect(servicePlaylistHref(service(), preparation)).toBe("/playlists/2026-11/2026-11-08-am");
  });

  it("never links a service the playlists do not have, or when they failed", () => {
    expect(servicePlaylistHref(service({ id: "2026-11-08-pm" }), preparation)).toBeNull();
    expect(servicePlaylistHref(service(), null)).toBeNull();
    expect(servicePlaylistHref(service(), { ok: false, months: [] })).toBeNull();
  });

  it("never links a service under way or not posted", () => {
    expect(servicePlaylistHref(service({ status: "now" }), preparation)).toBeNull();
    expect(servicePlaylistHref(service({ slots: [] }), preparation)).toBeNull();
  });
});

describe("Team", () => {
  it("condenses the team's availability to counts and the names of those away", () => {
    const person = (id: string, name: string) => ({ id, name, state: "available" }) as never;
    const result = teamAvailabilityRows({
      services: [{ date: "2026-11-08", slot: "AM", startsAt: inDays(6), kind: "regular", expected: [person("1", "Ann"), person("2", "Ben")], away: [person("3", "Cy")] }] as never,
      unset: [{ id: "4", name: "Dee" }],
      size: 4,
    });
    expect(result?.rows[0]).toMatchObject({ expected: 2, away: ["Cy"] });
    expect(result?.unset).toHaveLength(1);
    expect(teamAvailabilityRows(null)).toBeNull();
  });

  it("links only the management pages the viewer may open", () => {
    expect(teamTools(focusWith(), false)).toEqual([]);
    expect(teamTools(focusWith("manage_service_plans", "manage_users"), true).map((tool) => tool.key)).toEqual(["planner", "people", "requests", "support"]);
    expect(teamTools(focusWith("manage_service_plans"), false).map((tool) => tool.key)).toEqual(["planner"]);
  });
});
