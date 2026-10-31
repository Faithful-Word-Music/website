import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, explicitPermissions, type PermissionOverride } from "./permissions";
import {
  applicableRequirements,
  isEnforcing,
  missingInSection,
  missingRequirements,
  parsePolicy,
  participation,
  planDeadlines,
  profileStatus,
  type RequirementFacts,
  type RequirementKey,
  type RequirementPolicy,
} from "./profile-requirements";

const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));

function who(roleKeys: string[], overrides: PermissionOverride[] = [], roles: ReadonlyMap<string, readonly string[]> = rolePermissions) {
  return participation({ roleKeys, explicit: explicitPermissions(roleKeys, roles, overrides) });
}

const DAY = 24 * 60 * 60 * 1000;
const ACTIVATED = "2026-11-02T17:00:00.000Z";
const T_ACTIVATED = Date.parse(ACTIVATED);
const policy: RequirementPolicy = {
  version: 1,
  activatedAt: ACTIVATED,
  activatedBy: "user_admin",
  snapshot: "complete",
  snapshotCompletedAt: ACTIVATED,
  snapshotAccounts: 12,
  pausedAt: null,
};

const empty: RequirementFacts = {
  firstName: null,
  lastName: null,
  instruments: [],
  learningStyle: null,
  readsSheetMusic: null,
  availabilityReviewedAt: null,
  leading: { experience: null, unfamiliarHymns: null, unaccompaniedLeading: null },
};

const completeMusician: RequirementFacts = {
  ...empty,
  firstName: "Mary",
  lastName: "Smith",
  instruments: [{ proficiency: "confident", isPrimary: true }],
  learningStyle: 3,
  readsSheetMusic: true,
  availabilityReviewedAt: "2026-10-01T00:00:00.000Z",
};

describe("participation and applicable requirements", () => {
  it("asks everyone only for their name", () => {
    expect(applicableRequirements(who([]))).toEqual(["name"]);
    expect(applicableRequirements(who(["member"]))).toEqual(["name"]);
  });

  it("asks musicians about instruments, how they play, sheet music and availability", () => {
    expect(applicableRequirements(who(["musician"]))).toEqual([
      "name",
      "instruments",
      "instrument_proficiency",
      "primary_instrument",
      "learning_style",
      "reads_sheet_music",
      "availability_reviewed",
    ]);
  });

  it("asks song leaders about leading, sheet music and availability - never instruments", () => {
    const keys = applicableRequirements(who(["song_leader"]));
    expect(keys).toEqual([
      "name",
      "reads_sheet_music",
      "leading_experience",
      "leading_unfamiliar",
      "leading_unaccompanied",
      "availability_reviewed",
    ]);
    expect(keys).not.toContain("instruments");
  });

  it("asks someone who plays and leads the union, each shared question once", () => {
    const keys = applicableRequirements(who(["musician", "song_leader"]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key === "reads_sheet_music")).toHaveLength(1);
    expect(keys.filter((key) => key === "availability_reviewed")).toHaveLength(1);
    expect(keys).toContain("instruments");
    expect(keys).toContain("leading_experience");
  });

  it("treats a Music Director (who holds lead_songs) as a song leader, not a musician", () => {
    const keys = applicableRequirements(who(["music_director"]));
    expect(keys).toContain("leading_experience");
    expect(keys).not.toContain("instruments");
  });

  it("never makes an administrator a musician or song leader", () => {
    expect(applicableRequirements(who(["administrator"]))).toEqual(["name"]);
  });

  it("counts a custom role holding lead_songs, and a deny takes it away", () => {
    const roles = new Map([...rolePermissions, ["helper", ["lead_songs", "view_availability"]]]);
    expect(applicableRequirements(who(["helper"], [], roles))).toContain("leading_experience");
    expect(applicableRequirements(who(["song_leader"], [{ permission: "lead_songs", effect: "deny" }]))).toEqual(["name"]);
  });

  it("does not ask for availability someone cannot set (view_availability denied)", () => {
    const keys = applicableRequirements(who(["musician"], [{ permission: "view_availability", effect: "deny" }]));
    expect(keys).not.toContain("availability_reviewed");
    expect(keys).toContain("instruments");
  });

  it("an administrative custom role with lead_songs for planning still counts: they can be assigned", () => {
    const roles = new Map([...rolePermissions, ["office", ["manage_users", "lead_songs"]]]);
    const keys = applicableRequirements(who(["office"], [], roles));
    expect(keys).toContain("leading_experience");
    // ...but not availability, which they cannot set without view_availability.
    expect(keys).not.toContain("availability_reviewed");
  });
});

describe("missing requirements", () => {
  const musician = applicableRequirements(who(["musician"]));
  const leader = applicableRequirements(who(["song_leader"]));

  it("finds nothing missing on a complete musician", () => {
    expect(missingRequirements(musician, completeMusician)).toEqual([]);
  });

  it("counts false and an explicitly reviewed empty availability as answers", () => {
    const facts = { ...completeMusician, readsSheetMusic: false };
    expect(missingRequirements(musician, facts)).toEqual([]);
  });

  it("counts null as unanswered", () => {
    expect(missingRequirements(musician, { ...completeMusician, readsSheetMusic: null })).toEqual(["reads_sheet_music"]);
    expect(missingRequirements(musician, { ...completeMusician, learningStyle: null })).toEqual(["learning_style"]);
    expect(missingRequirements(musician, { ...completeMusician, availabilityReviewedAt: null })).toEqual(["availability_reviewed"]);
  });

  it("asks for instruments, then a proficiency for each and exactly one primary", () => {
    expect(missingRequirements(musician, { ...completeMusician, instruments: [] })).toEqual(["instruments"]);
    expect(
      missingRequirements(musician, {
        ...completeMusician,
        instruments: [
          { proficiency: null, isPrimary: false },
          { proficiency: "learning", isPrimary: false },
        ],
      }),
    ).toEqual(["instrument_proficiency", "primary_instrument"]);
    expect(
      missingRequirements(musician, {
        ...completeMusician,
        instruments: [
          { proficiency: "learning", isPrimary: true },
          { proficiency: "confident", isPrimary: true },
        ],
      }),
    ).toEqual(["primary_instrument"]);
  });

  it("never requires a photo, biography, voice part or theory (they are not requirements at all)", () => {
    const keys = applicableRequirements(who(["musician", "song_leader"]));
    for (const optional of ["photo", "bio", "voice_part", "theory_level", "phone", "middle_name", "preferred_name"]) {
      expect(keys).not.toContain(optional);
    }
  });

  it("asks a song leader each leading question until answered", () => {
    const facts = { ...empty, firstName: "John", lastName: "Doe", readsSheetMusic: false, availabilityReviewedAt: ACTIVATED };
    expect(missingRequirements(leader, facts)).toEqual(["leading_experience", "leading_unfamiliar", "leading_unaccompanied"]);
    const answered = { ...facts, leading: { experience: "beginner", unfamiliarHymns: "still_learning", unaccompaniedLeading: "with_preparation" } };
    expect(missingRequirements(leader, answered)).toEqual([]);
  });

  it("requires both names", () => {
    expect(missingRequirements(["name"], { ...empty, firstName: "Mary", lastName: " " })).toEqual(["name"]);
  });
});

describe("the policy", () => {
  it("reads a stored policy defensively", () => {
    expect(parsePolicy(null)).toBeNull();
    expect(parsePolicy({ activatedAt: "not a date" })).toBeNull();
    expect(parsePolicy({ activatedAt: ACTIVATED })).toMatchObject({ snapshot: "pending", pausedAt: null });
    expect(parsePolicy(policy)).toEqual(policy);
  });

  it("enforces only once the snapshot is complete and while not paused", () => {
    expect(isEnforcing(null)).toBe(false);
    expect(isEnforcing({ ...policy, snapshot: "pending" })).toBe(false);
    expect(isEnforcing({ ...policy, pausedAt: ACTIVATED })).toBe(false);
    expect(isEnforcing(policy)).toBe(true);
  });
});

describe("deadlines", () => {
  const applicable: RequirementKey[] = ["name", "reads_sheet_music", "leading_experience"];
  const before = T_ACTIVATED - 30 * DAY;
  const after = T_ACTIVATED + 3 * DAY;

  it("plans nothing without a policy", () => {
    expect(planDeadlines({ policy: null, applicable, existing: new Map(), hasBaseline: false, accountCreatedAt: before, now: after })).toEqual({
      deadlines: [],
      establishBaseline: false,
    });
  });

  it("gives an existing member seven days from activation, however late they first sign in", () => {
    const late = T_ACTIVATED + 20 * DAY;
    const plan = planDeadlines({ policy, applicable, existing: new Map(), hasBaseline: false, accountCreatedAt: before, now: late });
    expect(plan.establishBaseline).toBe(true);
    expect(plan.deadlines.map((d) => d.dueAt)).toEqual(Array(3).fill(new Date(T_ACTIVATED + 7 * DAY).toISOString()));
    expect(plan.deadlines.every((d) => d.firstAppliedAt === ACTIVATED)).toBe(true);
  });

  it("gives a new member (created after activation) no grace period", () => {
    const created = T_ACTIVATED + 10 * DAY;
    const now = created + 60_000;
    const plan = planDeadlines({ policy, applicable, existing: new Map(), hasBaseline: false, accountCreatedAt: created, now });
    expect(plan.deadlines.every((d) => Date.parse(d.dueAt) === now)).toBe(true);
  });

  it("decides newness by the account's creation time, not by what is stored", () => {
    // An old account with nothing stored at all is still an existing member.
    const plan = planDeadlines({ policy, applicable, existing: new Map(), hasBaseline: false, accountCreatedAt: T_ACTIVATED - 1, now: after });
    expect(plan.deadlines[0].dueAt).toBe(new Date(T_ACTIVATED + 7 * DAY).toISOString());
  });

  it("gives a requirement gained after the baseline its own seven days, leaving the others alone", () => {
    const existing = new Map<RequirementKey, string>([["name", new Date(T_ACTIVATED + 7 * DAY).toISOString()]]);
    const now = T_ACTIVATED + 30 * DAY;
    const plan = planDeadlines({ policy, applicable, existing, hasBaseline: true, accountCreatedAt: before, now });
    expect(plan.establishBaseline).toBe(false);
    expect(plan.deadlines.map((d) => d.key)).toEqual(["reads_sheet_music", "leading_experience"]);
    expect(plan.deadlines.every((d) => d.dueAt === new Date(now + 7 * DAY).toISOString())).toBe(true);
  });

  it("gives a new member who later gains a role seven days for the new questions", () => {
    const existing = new Map<RequirementKey, string>([["name", ACTIVATED]]);
    const plan = planDeadlines({ policy, applicable, existing, hasBaseline: true, accountCreatedAt: T_ACTIVATED + DAY, now: after });
    expect(plan.deadlines.every((d) => d.dueAt === new Date(after + 7 * DAY).toISOString())).toBe(true);
  });

  it("never moves an existing deadline (a role removed and given back keeps it)", () => {
    const existing = new Map<RequirementKey, string>(applicable.map((key) => [key, ACTIVATED]));
    expect(planDeadlines({ policy, applicable, existing, hasBaseline: true, accountCreatedAt: before, now: after }).deadlines).toEqual([]);
  });

  it("plans nothing when the account's age is unknown", () => {
    expect(planDeadlines({ policy, applicable, existing: new Map(), hasBaseline: false, accountCreatedAt: null, now: after })).toEqual({
      deadlines: [],
      establishBaseline: false,
    });
  });

  it("plans the same thing however often it is asked (concurrent sessions)", () => {
    const input = { policy, applicable, existing: new Map<RequirementKey, string>(), hasBaseline: false, accountCreatedAt: before, now: after };
    expect(planDeadlines(input)).toEqual(planDeadlines({ ...input, now: after + 5_000 }));
  });
});

describe("profile status", () => {
  const participationOf = who(["song_leader"]);
  const applicable = applicableRequirements(participationOf);
  const due = new Date(T_ACTIVATED + 7 * DAY).toISOString();
  const deadlines = new Map<RequirementKey, string>(applicable.map((key) => [key, due]));
  const status = (overrides: Partial<Parameters<typeof profileStatus>[0]>) =>
    profileStatus({ policy, participation: participationOf, applicable, missing: ["leading_experience"], deadlines, now: T_ACTIVATED + DAY, ...overrides });

  it("is complete with nothing missing, whatever the dates", () => {
    expect(status({ missing: [], now: T_ACTIVATED + 100 * DAY }).state).toBe("complete");
  });

  it("is only advisory without a policy", () => {
    const result = status({ policy: null });
    expect(result.state).toBe("advisory");
    expect(result.dueAt).toBeNull();
  });

  it("is in grace before the deadline, with the earliest deadline", () => {
    const result = status({});
    expect(result.state).toBe("grace");
    expect(result.dueAt).toBe(due);
    expect(result.missing).toEqual([{ key: "leading_experience", dueAt: due }]);
  });

  it("blocks once the deadline has passed", () => {
    expect(status({ now: Date.parse(due) }).state).toBe("blocked");
  });

  it("never blocks while the snapshot is pending or the policy is paused", () => {
    expect(status({ now: Date.parse(due) + DAY, policy: { ...policy, snapshot: "pending" } }).state).toBe("grace");
    expect(status({ now: Date.parse(due) + DAY, policy: { ...policy, pausedAt: ACTIVATED } }).state).toBe("grace");
  });

  it("stops blocking as soon as the missing answer is saved (another session sees it on its next request)", () => {
    const late = Date.parse(due) + DAY;
    expect(status({ now: late }).state).toBe("blocked");
    expect(status({ now: late, missing: [] }).state).toBe("complete");
  });

  it("partial completion keeps the rest due", () => {
    const result = status({ missing: ["leading_unfamiliar", "leading_unaccompanied"], now: Date.parse(due) + 1 });
    expect(result.state).toBe("blocked");
    expect(result.missing.map((item) => item.key)).toEqual(["leading_unfamiliar", "leading_unaccompanied"]);
  });
});

describe("required answers within one section (what a save must include)", () => {
  const leaderNeeds = new Set(applicableRequirements(who(["song_leader"])));
  const musicianNeeds = new Set(applicableRequirements(who(["musician"])));
  const memberNeeds = new Set(applicableRequirements(who([])));

  it("refuses clearing a required answer, and allows clearing an optional one", () => {
    expect(missingInSection("shared", { readsSheetMusic: null }, leaderNeeds)).toEqual(["reads_sheet_music"]);
    expect(missingInSection("shared", { readsSheetMusic: false }, leaderNeeds)).toEqual([]);
    // Someone who neither plays nor leads is not asked it.
    expect(missingInSection("shared", { readsSheetMusic: null }, memberNeeds)).toEqual([]);
  });

  it("refuses a partly answered song-leading section", () => {
    const leading = { experience: "beginner", unfamiliarHymns: null, unaccompaniedLeading: "comfortable" };
    expect(missingInSection("leading", { leading }, leaderNeeds)).toEqual(["leading_unfamiliar"]);
  });

  it("refuses a musician removing every instrument or clearing how they play", () => {
    expect(missingInSection("music", { instruments: [], learningStyle: 2 }, musicianNeeds)).toEqual(["instruments"]);
    expect(missingInSection("music", { instruments: [{ proficiency: "learning", isPrimary: true }], learningStyle: null }, musicianNeeds)).toEqual([
      "learning_style",
    ]);
    // A song leader may list no instruments at all.
    expect(missingInSection("music", { instruments: [], learningStyle: null }, leaderNeeds)).toEqual([]);
  });

  it("refuses an empty name for everyone", () => {
    expect(missingInSection("about", { firstName: "Mary", lastName: "" }, memberNeeds)).toEqual(["name"]);
  });
});
