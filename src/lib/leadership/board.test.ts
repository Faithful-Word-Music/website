import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, resolvePermissions, type Permission, type PermissionOverride } from "@/lib/auth/permissions";
import { explicitHolderIds } from "@/lib/availability/access";

import { leadershipAccess, visibleLeadership } from "./access";
import {
  availableFor,
  captionText,
  cardLeaderView,
  leadershipProblems,
  matchCardLeaders,
  myAssignments,
  publishedRosters,
  songListLeaders,
  type Board,
  type BoardService,
} from "./board";
import { effectiveLeaders, GUEST_LEADER } from "./model";

const NOW = Date.parse("2026-11-01T12:00:00-07:00");
const DIRECTOR = "user_director";
const BRIAN = "user_brian";
const CARL = "user_carl";
const ROLE_PERMISSIONS = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

/** A signed-in person, their permissions worked out exactly as the site does. */
function person(userId: string, roles: string[], overrides: PermissionOverride[] = []) {
  const permissions = resolvePermissions([...roles, "member"], ROLE_PERMISSIONS, overrides);
  return { userId, can: (permission: Permission) => permissions.has(permission) };
}

const director = person(DIRECTOR, ["music_director"]);
const admin = person("user_admin", ["administrator"]);
const brian = person(BRIAN, ["song_leader"]);
const musician = person("user_mary", ["musician"]);
const member = person("user_member", []);

const song = (title: string, number: string | null = "100", key: string | null = "G") => ({ title, number, key });

function service(input: Partial<BoardService> & Pick<BoardService, "anchor" | "date" | "status">): BoardService {
  return {
    slot: "PM",
    startsAt: `${input.date}T18:00:00-07:00`,
    label: null,
    normalKey: "sunday_pm",
    places: ["a", "b", "c", "d", "e"],
    songs: null,
    leadership: { defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } }, revision: 1 },
    ...input,
  };
}

const published = service({
  anchor: "2026-11-08-pm",
  date: "2026-11-08",
  status: "published",
  songs: [song("Amazing Grace", "1", "G"), song("Holy, Holy, Holy", "2", "D"), song("Psalm 120", null, "D"), null, song("Be Thou My Vision", "3", "Eb")],
});
const draft = service({
  anchor: "2026-11-11-pm",
  date: "2026-11-11",
  status: "draft",
  normalKey: "wednesday_pm",
  leadership: { defaultUserId: null, overrides: { b: { kind: "assigned", userId: BRIAN }, d: { kind: "assigned", userId: BRIAN }, a: { kind: "assigned", userId: CARL } }, revision: 3 },
});
const cancelled = service({ anchor: "2026-11-15-pm", date: "2026-11-15", status: "cancelled" });

function board(services: BoardService[], options: { awayBrian?: boolean; ineligible?: string[] } = {}): Board {
  const people = [DIRECTOR, BRIAN, CARL].map((id) => ({
    id,
    name: id === DIRECTOR ? "Alex" : id === BRIAN ? "Brian" : "Carl",
    eligible: !(options.ineligible ?? []).includes(id),
    normal: ["sunday_am", "sunday_pm", "wednesday_pm"] as Array<"sunday_am" | "sunday_pm" | "wednesday_pm">,
  }));
  return {
    services,
    people: new Map(people.map((item) => [item.id, item])),
    exceptions: new Map(options.awayBrian ? [[`${BRIAN}|2026-11-08|PM`, "unavailable" as const]] : []),
  };
}

describe("who may see which leaders", () => {
  it("lets whoever plans the services see everything, drafts included", () => {
    for (const viewer of [director, admin]) {
      for (const status of ["not-started", "draft", "published", "cancelled"] as const) expect(leadershipAccess(viewer, status)).toBe("manage");
    }
  });

  it("shows a published service's whole roster to the ministry, and a draft's to nobody but the planner", () => {
    for (const viewer of [brian, musician]) {
      expect(leadershipAccess(viewer, "published")).toBe("roster");
      expect(leadershipAccess(viewer, "draft")).toBe("own");
      expect(leadershipAccess(viewer, "not-started")).toBe("own");
    }
    // A Member does not prepare from the song lists: only their own part, ever.
    expect(leadershipAccess(member, "published")).toBe("own");
    expect(leadershipAccess(brian, "cancelled")).toBeNull();
  });

  it("follows individual grants and denies, not role names", () => {
    const granted = person("user_g", [], [{ permission: "view_service_plans", effect: "grant" }]);
    const denied = person("user_d", ["musician"], [{ permission: "view_service_plans", effect: "deny" }]);
    const custom = person("user_c", [], [{ permission: "manage_service_plans", effect: "grant" }]);
    expect(leadershipAccess(granted, "published")).toBe("roster");
    expect(leadershipAccess(denied, "published")).toBe("own");
    expect(leadershipAccess(custom, "draft")).toBe("manage");
  });

  it("gives a leader of a draft only their own positions - no roster, no one else", () => {
    const effective = effectiveLeaders(draft.places, draft.leadership);
    expect(visibleLeadership(brian, "draft", effective)).toEqual({ access: "own", mine: [2, 4], places: null });
    expect(visibleLeadership(musician, "draft", effective)).toBeNull();
    expect(visibleLeadership(director, "draft", effective)?.places).toHaveLength(5);
  });
});

describe("who can be chosen to lead", () => {
  it("is everyone holding lead_songs on purpose: Song Leaders and the Music Director, not an administrator by default", () => {
    const userRoles = new Map([
      [DIRECTOR, ["music_director"]],
      [BRIAN, ["song_leader"]],
      ["user_mary", ["musician"]],
      ["user_admin", ["administrator"]],
      ["user_both", ["musician", "song_leader"]],
    ]);
    const overrides = new Map<string, PermissionOverride[]>([
      ["user_granted", [{ permission: "lead_songs", effect: "grant" }]],
      [BRIAN, [{ permission: "lead_songs", effect: "deny" }]],
    ]);
    expect(explicitHolderIds("lead_songs", userRoles, ROLE_PERMISSIONS, overrides).sort()).toEqual([DIRECTOR, "user_both", "user_granted"].sort());
  });
});

describe("a leader's own services", () => {
  it("names the songs of a published service, and only positions for a draft", () => {
    const mine = myAssignments(board([published, draft, cancelled]), brian, NOW);
    expect(mine.map((item) => item.anchor)).toEqual(["2026-11-08-pm", "2026-11-11-pm"]);
    expect(mine[0]).toMatchObject({ published: true, positions: [5], songs: [{ position: 5, title: "Be Thou My Vision", number: "3", key: "Eb" }] });
    expect(mine[1]).toMatchObject({ published: false, positions: [2, 4], songs: null });
    // Nothing of the draft's songs is anywhere in it - the board never had them.
    expect(JSON.stringify(mine[1])).not.toMatch(/title/);
  });

  it("leaves out cancelled services and those already over", () => {
    expect(myAssignments(board([cancelled]), director, NOW)).toEqual([]);
    expect(myAssignments(board([published]), director, Date.parse("2026-11-09T00:00:00-07:00"))).toEqual([]);
  });

  it("says when they are marked unavailable", () => {
    expect(myAssignments(board([published], { awayBrian: true }), brian, NOW)[0].unavailable).toBe(true);
    expect(myAssignments(board([published]), brian, NOW)[0].unavailable).toBe(false);
  });
});

describe("availability, by the availability rules", () => {
  const b = board([published], { awayBrian: true });
  it("is normal unless an exception says otherwise, and unknown for someone who cannot lead", () => {
    expect(availableFor(b, published)(DIRECTOR)).toBe(true);
    expect(availableFor(b, published)(BRIAN)).toBe(false);
    expect(availableFor(board([published], { ineligible: [CARL] }), published)(CARL)).toBeNull();
    // Not normally there, but coming by exception.
    const extra: Board = {
      ...b,
      people: new Map([[CARL, { id: CARL, name: "Carl", eligible: true, normal: [] }]]),
      exceptions: new Map([[`${CARL}|2026-11-08|PM`, "available" as const]]),
    };
    expect(availableFor(extra, published)(CARL)).toBe(true);
    expect(availableFor({ ...extra, exceptions: new Map() }, published)(CARL)).toBe(false);
  });
});

describe("the song list's leaders", () => {
  it("are names beside every place of a published service - never an account or place ID, never a draft", () => {
    const leaders = songListLeaders(board([published, draft]), musician, NOW);
    expect(leaders.map((item) => item.anchor)).toEqual(["2026-11-08-pm"]);
    const alex = { name: "Alex", mine: false };
    expect(leaders[0].places).toEqual([
      { title: "Amazing Grace", leader: alex },
      { title: "Holy, Holy, Holy", leader: alex },
      { title: "Psalm 120", leader: alex },
      // An empty place is a row on the song list too ("to be announced").
      { title: null, leader: alex },
      { title: "Be Thou My Vision", leader: { name: "Brian", mine: false } },
    ]);
    const text = JSON.stringify(leaders);
    expect(text).not.toContain("user_");
    expect(text).not.toMatch(/"(a|b|c|d|e)"/);
  });

  it("are given only to people who prepare from the song lists", () => {
    expect(songListLeaders(board([published]), member, NOW)).toEqual([]);
    expect(songListLeaders(board([published]), brian, NOW)[0].places.at(-1)?.leader).toEqual({ name: "Brian", mine: true });
  });

  it("name one person once only when they lead every song - otherwise every song says who, or that no one does", () => {
    const alex = { name: "Alex", mine: false };
    const you = { name: "Alex", mine: true };
    const brian = { name: "Brian", mine: false };
    // One person, every song: once, for the service; nothing on the songs.
    expect(cardLeaderView([alex, alex, alex, alex, alex])).toEqual({ service: alex, rows: {} });
    // Four songs led by you, the last by no one: never "Led by you" for the whole service.
    expect(cardLeaderView([you, you, you, you, null])).toEqual({ service: null, rows: { 1: you, 2: you, 3: you, 4: you, 5: null } });
    // A Sunday: someone else leads the last song.
    expect(cardLeaderView([alex, alex, alex, alex, brian])).toEqual({ service: null, rows: { 1: alex, 2: alex, 3: alex, 4: alex, 5: brian } });
    // No song has a leader: nothing at all.
    expect(cardLeaderView([null, null])).toBeNull();
    const words = { ledBy: "Led by {name}", ledByYou: "Led by you", noLeader: "No leader yet" };
    expect([captionText(alex, words), captionText(you, words), captionText(null, words)]).toEqual(["Led by Alex", "Led by you", "No leader yet"]);
  });

  it("show on a card only while its rows match - never on a stale copy", () => {
    const [leaders] = songListLeaders(board([published]), brian, NOW);
    const rows = published.songs!.map((item) => (item ? { title: item.title } : null));
    const alex = { name: "Alex", mine: false };
    expect(matchCardLeaders(leaders, rows)).toEqual({ service: null, rows: { 1: alex, 2: alex, 3: alex, 4: alex, 5: { name: "Brian", mine: true } } });
    const stale = rows.map((row, index) => (index === 1 ? { title: "Another Song" } : row));
    expect(matchCardLeaders(leaders, stale)).toBeNull();
    expect(matchCardLeaders(leaders, [...rows, { title: "Extra" }])).toBeNull();
    // A song filled in since: the rows no longer match.
    expect(matchCardLeaders(leaders, rows.map((row, index) => (index === 3 ? { title: "New" } : row)))).toBeNull();
  });

  it("show a scheduler who leads songs in a draft their own part on the Dashboard, as anyone else", () => {
    const leaderDraft = { ...draft, leadership: { defaultUserId: DIRECTOR, overrides: {}, revision: 1 } };
    expect(publishedRosters(board([leaderDraft]), director).get("2026-11-11-pm")).toEqual({
      access: "own",
      mine: [1, 2, 3, 4, 5],
      places: null,
      names: [],
    });
  });
});

describe("the Dashboard's rosters and problems", () => {
  it("show a published service's roster, and a draft only as the viewer's own part", () => {
    const rosters = publishedRosters(board([published, draft]), brian);
    expect(rosters.get("2026-11-08-pm")?.names).toEqual(["Alex", "Alex", "Alex", "Alex", "Brian"]);
    expect(rosters.get("2026-11-11-pm")).toEqual({ access: "own", mine: [2, 4], places: null, names: [] });
    expect(publishedRosters(board([published, draft]), musician).has("2026-11-11-pm")).toBe(false);
    // The planner sees drafts in the planner, not on the Dashboard's cards.
    expect(publishedRosters(board([draft]), director).has("2026-11-11-pm")).toBe(false);
  });

  it("find songs without a leader, leaders away, and leaders who can no longer lead", () => {
    const problems = leadershipProblems(board([published, draft, cancelled], { awayBrian: true, ineligible: [CARL] }), NOW, NOW + 14 * 86_400_000);
    expect(problems.map((problem) => problem.anchor)).toEqual(["2026-11-08-pm", "2026-11-11-pm"]);
    expect(problems[0]).toMatchObject({ unled: 0, conflicts: [{ name: "Brian", positions: [5] }], ineligible: [] });
    expect(problems[1]).toMatchObject({ unled: 2, ineligible: [{ name: "Carl", positions: [1] }] });
  });

  it("are nothing once every song has an available leader", () => {
    expect(leadershipProblems(board([published]), NOW, NOW + 14 * 86_400_000)).toEqual([]);
  });
});

describe("a guest song leader", () => {
  const withGuest = (services: BoardService[]): Board => {
    const b = board(services, { awayBrian: true });
    b.people.set(GUEST_LEADER, { id: GUEST_LEADER, name: "a guest", eligible: true, normal: [] });
    return b;
  };
  const guestSunday = service({
    anchor: "2026-11-08-pm",
    date: "2026-11-08",
    status: "published",
    songs: published.songs,
    leadership: { defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: GUEST_LEADER } }, revision: 2 },
  });

  it("is captioned as a guest, and never named by an account", () => {
    const [leaders] = songListLeaders(withGuest([guestSunday]), musician, NOW);
    const rows = guestSunday.songs!.map((item) => (item ? { title: item.title } : null));
    const captions = matchCardLeaders(leaders, rows)!.rows;
    expect(captions[5]).toEqual({ name: "a guest", mine: false });
    expect(captionText(captions[5], { ledBy: "Led by {name}", ledByYou: "Led by you", noLeader: "No leader yet" })).toBe("Led by a guest");
    expect(JSON.stringify(leaders)).not.toContain(`"${GUEST_LEADER}"`);
  });

  it("has no availability to conflict with, and is never 'no longer eligible'", () => {
    const b = withGuest([guestSunday]);
    expect(availableFor(b, guestSunday)(GUEST_LEADER)).toBeNull();
    expect(leadershipProblems(b, NOW, NOW + 14 * 86_400_000)).toEqual([]);
  });
});
