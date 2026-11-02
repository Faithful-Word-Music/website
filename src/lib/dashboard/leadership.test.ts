import { describe, expect, it } from "vitest";

import { fixupGrants, PERMISSION_FIXUPS, DEFAULT_ROLES } from "@/lib/auth/permissions";
import type { LeadershipProblem, MyAssignment } from "@/lib/leadership/board";

import { cardLeaders, laterAssignments, leadershipAttention, myLeadingAttention } from "./leadership";

const NOW = Date.parse("2026-11-01T12:00:00-07:00");
const DAY = 86_400_000;

const problem = (overrides: Partial<LeadershipProblem>): LeadershipProblem => ({
  anchor: "2026-11-08-pm",
  startsAt: "2026-11-08T18:00:00-07:00",
  label: null,
  slot: "PM",
  unled: 0,
  conflicts: [],
  ineligible: [],
  ...overrides,
});

const assignment = (anchor: string, startsAt: string, extra: Partial<MyAssignment> = {}): MyAssignment => ({
  anchor,
  date: startsAt.slice(0, 10),
  slot: "PM",
  startsAt,
  label: null,
  published: false,
  positions: [5],
  songs: null,
  unavailable: false,
  ...extra,
});

describe("Coming up cards", () => {
  it("caption each run of a published service's songs with its leader, once", () => {
    const rosters = new Map([
      ["2026-11-08-pm", { access: "roster" as const, mine: [], places: [], names: ["Alex", "Alex", "Alex", "Alex", "Brian"] }],
    ]);
    expect(cardLeaders({ id: "2026-11-08-pm" }, rosters)).toEqual({
      view: { service: null, rows: { 1: { name: "Alex", mine: false, imageUrl: null }, 2: { name: "Alex", mine: false, imageUrl: null }, 3: { name: "Alex", mine: false, imageUrl: null }, 4: { name: "Alex", mine: false, imageUrl: null }, 5: { name: "Brian", mine: false, imageUrl: null } } },
      mine: [],
    });
  });

  it("give a draft's leader only their own positions - no names", () => {
    const rosters = new Map([["2026-11-11-pm", { access: "own" as const, mine: [2, 4], places: null, names: [] }]]);
    expect(cardLeaders({ id: "2026-11-11-pm" }, rosters)).toEqual({ view: null, mine: [2, 4] });
    expect(cardLeaders({ id: "2026-11-15-pm" }, rosters)).toBeNull();
  });
});

describe("the viewer's later assignments", () => {
  it("leave out the services already on a card, and stop at four", () => {
    const mine = ["a", "b", "c", "d", "e", "f"].map((anchor, index) => assignment(anchor, new Date(NOW + (index + 1) * DAY).toISOString()));
    expect(laterAssignments(mine, new Set(["a"])).map((item) => item.anchor)).toEqual(["b", "c", "d", "e"]);
  });
});

describe("Needs your attention", () => {
  it("is only for whoever plans the services", () => {
    expect(leadershipAttention({ plansServices: false }, [problem({ unled: 2 })], NOW)).toEqual([]);
    expect(leadershipAttention({ plansServices: true }, null, NOW)).toEqual([]);
  });

  it("gathers every service with songs to assign into one item, and names each leader who is away", () => {
    const items = leadershipAttention(
      { plansServices: true },
      [
        problem({ unled: 1, conflicts: [{ name: "Brian", positions: [5] }] }),
        problem({ anchor: "2026-11-11-pm", startsAt: "2026-11-11T18:00:00-07:00", unled: 5 }),
      ],
      NOW,
    );
    expect(items.map((item) => item.id)).toEqual(["leaders:unled", "leaders:away:2026-11-08-pm:Brian"]);
    expect(items[0]).toMatchObject({ title: "2 services in the next two weeks have songs without a leader", href: "/service-planner/2026-11-08-pm" });
    expect(items[1].title).toBe("Brian leads song 5 at Sunday Evening · Sun, Nov 8 but is unavailable");
  });

  it("is urgent within three days", () => {
    const soon = problem({ startsAt: new Date(NOW + 2 * DAY).toISOString(), unled: 1 });
    expect(leadershipAttention({ plansServices: true }, [soon], NOW)[0].priority).toBe("urgent");
    expect(leadershipAttention({ plansServices: true }, [problem({ unled: 1 })], NOW)[0].priority).toBe("normal");
  });

  it("tells a leader of a service they are marked unavailable for, and where to change it", () => {
    const items = myLeadingAttention(
      [assignment("2026-11-08-pm", "2026-11-08T18:00:00-07:00", { unavailable: true, positions: [2, 5] }), assignment("x", "2026-11-11T18:00:00-07:00")],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "leaders:mine:2026-11-08-pm", href: "/availability?month=2026-11&view=me" });
    expect(items[0].title).toContain("songs 2 and 5");
  });
});

describe("who can lead, from the start", () => {
  it("is the Song Leader and the Music Director - given to existing sites once, by a fix-up", () => {
    const holders = DEFAULT_ROLES.filter((role) => role.permissions.includes("lead_songs")).map((role) => role.key);
    expect(holders.sort()).toEqual(["administrator", "music_director", "song_leader"]);
    expect(PERMISSION_FIXUPS.find((fixup) => fixup.permissions.includes("lead_songs"))?.key).toBe("2026-10-lead-songs-permission");
    expect(fixupGrants(["lead_songs"])).toEqual([
      { role: "music_director", permission: "lead_songs" },
      { role: "song_leader", permission: "lead_songs" },
    ]);
  });
});
