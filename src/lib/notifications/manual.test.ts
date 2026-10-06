import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES } from "@/lib/auth/permissions";

import { resolveAudience, type Directory } from "./audience";
import { NOTIFICATION_EVENTS, type NotificationEventDefinition } from "./catalog";
import {
  ANNOUNCEMENT_EVENT,
  EMPTY_SELECTION,
  MANUAL_AUDIENCES,
  describeSelection,
  parseDraft,
  parseSelection,
  parseSnapshot,
  pruneSelection,
  summarizeDeliveries,
  toAudience,
  type AudienceSelection,
  type DeliveryAttempt,
} from "./manual";
import { NOTIFICATION_LIMITS } from "./model";

const selection = (part: Partial<AudienceSelection>): AudienceSelection => ({ ...EMPTY_SELECTION, ...part });

const draft = (part: Record<string, unknown> = {}) => ({
  title: "Rehearsal moved",
  body: "Thursday at 7:00.",
  actionUrl: "/song-list",
  priority: "normal",
  audience: selection({ named: ["musicians"] }),
  ...part,
});

describe("the announcement event", () => {
  const definition: NotificationEventDefinition = NOTIFICATION_EVENTS[ANNOUNCEMENT_EVENT];

  it("is its own event, filed under Announcements, at normal priority", () => {
    expect(ANNOUNCEMENT_EVENT).toBe("admin.announcement");
    expect(definition.category).toBe("admin_announcement");
    expect(definition.priority).toBe("normal");
    // The development test button keeps its own event.
    expect(NOTIFICATION_EVENTS["system.test"].category).not.toBe("admin_announcement");
  });

  it("never folds, and leads nowhere unless its writer says", () => {
    expect(definition.coalesce).toBeUndefined();
    expect(definition.actionUrl).toBeUndefined();
  });
});

describe("an audience selection", () => {
  it("is every part a list of the right things, each once", () => {
    expect(parseSelection({ named: ["musicians", "musicians"], roles: ["helper", "helper"], userIds: ["user_a", "user_a"], instrumentIds: [2, 2] })).toEqual({
      named: ["musicians"],
      roles: ["helper"],
      userIds: ["user_a"],
      instrumentIds: [2],
    });
  });

  it("refuses anything malformed", () => {
    const good = { named: [], roles: [], userIds: [], instrumentIds: [] };
    for (const bad of [
      null,
      "everyone",
      [],
      {},
      { ...good, named: "everyone" },
      { ...good, named: ["no_such_audience"] },
      // A named audience the composer does not offer.
      { ...good, named: ["accountManagers"] },
      { ...good, roles: ["Not A Key"] },
      { ...good, roles: [7] },
      { ...good, userIds: ["someone@example.com"] },
      { ...good, userIds: ["user_ok", null] },
      { ...good, instrumentIds: ["1"] },
      { ...good, instrumentIds: [0] },
      { ...good, instrumentIds: [1.5] },
      { ...good, userIds: Array.from({ length: 201 }, (_, index) => `user_${index}`) },
    ]) {
      expect(parseSelection(bad), JSON.stringify(bad)?.slice(0, 60)).toBeNull();
    }
  });

  it("offers only audiences the notification system knows", () => {
    expect(MANUAL_AUDIENCES).toEqual(["everyone", "musicTeam", "musicians", "songLeaders", "planners", "administrators", "servicePlanViewers", "availabilityManagers", "aiUsers"]);
  });
});

describe("a draft", () => {
  it("is tidied as any notification is", () => {
    const result = parseDraft(draft({ title: "  Rehearsal   moved ", body: " Thursday\n\n\n\nat 7:00. ", actionUrl: " /song-list " }), { complete: true });
    expect(result).toEqual({
      ok: true,
      draft: { title: "Rehearsal moved", body: "Thursday\n\nat 7:00.", actionUrl: "/song-list", priority: "normal", audience: selection({ named: ["musicians"] }) },
    });
  });

  it("needs a title within the limit", () => {
    expect(parseDraft(draft({ title: "   " }), { complete: true })).toEqual({ ok: false, problem: "title" });
    expect(parseDraft(draft({ title: "x".repeat(NOTIFICATION_LIMITS.titleChars + 1) }), { complete: true })).toEqual({ ok: false, problem: "title" });
    expect(parseDraft(draft({ title: "x".repeat(NOTIFICATION_LIMITS.titleChars) }), { complete: true }).ok).toBe(true);
    expect(parseDraft(draft({ title: 7 }), { complete: true })).toEqual({ ok: false, problem: "title" });
  });

  it("needs a message within the limit to be sent", () => {
    expect(parseDraft(draft({ body: " " }), { complete: true })).toEqual({ ok: false, problem: "body" });
    expect(parseDraft(draft({ body: "x".repeat(NOTIFICATION_LIMITS.bodyChars + 1) }), { complete: true })).toEqual({ ok: false, problem: "body" });
    expect(parseDraft(draft({ body: "x".repeat(NOTIFICATION_LIMITS.bodyChars) }), { complete: true }).ok).toBe(true);
  });

  it("leads only to a page on this site, or nowhere", () => {
    for (const actionUrl of ["https://elsewhere.example/", "//elsewhere.example", "javascript:alert(1)", "song-list", "/\\elsewhere.example", 7]) {
      expect(parseDraft(draft({ actionUrl }), { complete: true }), String(actionUrl)).toEqual({ ok: false, problem: "link" });
    }
    for (const actionUrl of ["", null, undefined]) {
      const result = parseDraft(draft({ actionUrl }), { complete: true });
      expect(result.ok && result.draft.actionUrl).toBeNull();
    }
  });

  it("has one of the three priorities, and is normal unless told", () => {
    expect(parseDraft(draft({ priority: "urgent" }), { complete: true })).toEqual({ ok: false, problem: "priority" });
    expect(parseDraft(draft({ priority: 1 }), { complete: true })).toEqual({ ok: false, problem: "priority" });
    const unset = parseDraft(draft({ priority: undefined }), { complete: true });
    expect(unset.ok && unset.draft.priority).toBe("normal");
    const critical = parseDraft(draft({ priority: "critical" }), { complete: true });
    expect(critical.ok && critical.draft.priority).toBe("critical");
  });

  it("needs an audience to be sent, and a well-formed one always", () => {
    expect(parseDraft(draft({ audience: EMPTY_SELECTION }), { complete: true })).toEqual({ ok: false, problem: "audience" });
    expect(parseDraft(draft({ audience: { named: ["everyone"] } }), { complete: true })).toEqual({ ok: false, problem: "audience" });
    expect(parseDraft(draft({ audience: "everyone" }), { complete: false })).toEqual({ ok: false, problem: "audience" });
  });

  it("may be kept as a template without a message or an audience, but not without a title", () => {
    expect(parseDraft(draft({ body: "", audience: EMPTY_SELECTION }), { complete: false }).ok).toBe(true);
    expect(parseDraft(draft({ title: "" }), { complete: false })).toEqual({ ok: false, problem: "title" });
  });
});

describe("a selection as an audience", () => {
  const directory: Directory = {
    userRoles: new Map([
      ["user_john", ["musician"]],
      ["user_mary", ["song_leader"]],
      ["user_director", ["music_director"]],
      ["user_admin", ["administrator"]],
      ["user_usher", ["usher"]],
    ]),
    rolePermissions: new Map([...DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]] as const), ["usher", []]]),
    overrides: new Map(),
    accountIds: ["user_john", "user_mary", "user_director", "user_admin", "user_usher", "user_member"],
  };
  const people = (part: Partial<AudienceSelection>, players: string[] = []) => resolveAudience(toAudience(selection(part), players), directory).sort();

  it("is each named audience as every feature means it", () => {
    expect(people({ named: ["everyone"] })).toEqual(["user_admin", "user_director", "user_john", "user_mary", "user_member", "user_usher"]);
    expect(people({ named: ["musicians"] })).toEqual(["user_john"]);
    expect(people({ named: ["songLeaders"] })).toEqual(["user_mary"]);
    expect(people({ named: ["musicTeam"] })).toEqual(["user_director", "user_john", "user_mary"]);
    expect(people({ named: ["planners"] })).toEqual(["user_admin", "user_director"]);
    expect(people({ named: ["administrators"] })).toEqual(["user_admin"]);
    expect(people({ named: ["servicePlanViewers"] })).toEqual(["user_director", "user_john", "user_mary"]);
    expect(people({ named: ["availabilityManagers"] })).toEqual(["user_director"]);
    expect(people({ named: ["aiUsers"] })).toEqual(["user_admin", "user_director"]);
  });

  it("is a role of the site's own making, particular people, and whoever plays an instrument", () => {
    expect(people({ roles: ["usher"] })).toEqual(["user_usher"]);
    expect(people({ userIds: ["user_member"] })).toEqual(["user_member"]);
    expect(people({ instrumentIds: [1] }, ["user_mary", "user_member"])).toEqual(["user_mary", "user_member"]);
  });

  it("is anyone in any part, each once", () => {
    // John is a musician, plays the piano and is named: one John.
    expect(people({ named: ["musicians", "songLeaders"], userIds: ["user_john", "user_usher"], instrumentIds: [1] }, ["user_john", "user_mary"])).toEqual([
      "user_john",
      "user_mary",
      "user_usher",
    ]);
  });

  it("is nobody when nothing is chosen", () => {
    expect(people({})).toEqual([]);
  });
});

describe("what a selection names", () => {
  const known = {
    roles: [{ key: "musician", label: "Musician" }],
    instruments: [{ id: 1, label: "Piano" }],
    people: [{ id: "user_john", name: "John Smith" }],
  };
  const named = Object.fromEntries(MANUAL_AUDIENCES.map((key) => [key, key.toUpperCase()])) as Record<(typeof MANUAL_AUDIENCES)[number], string>;

  it("is put in words from the lists it chooses among", () => {
    expect(describeSelection(selection({ named: ["everyone"], roles: ["musician"], userIds: ["user_john"], instrumentIds: [1] }), named, known)).toEqual({
      named: ["EVERYONE"],
      roles: ["Musician"],
      instruments: ["Piano"],
      people: ["John Smith"],
    });
  });

  it("loses what is no longer there, and says that it did", () => {
    const stale = selection({ named: ["musicians"], roles: ["musician", "gone"], userIds: ["user_john", "user_gone"], instrumentIds: [1, 9] });
    expect(pruneSelection(stale, known)).toEqual({ selection: selection({ named: ["musicians"], roles: ["musician"], userIds: ["user_john"], instrumentIds: [1] }), dropped: true });
    expect(pruneSelection(selection({ roles: ["musician"] }), known).dropped).toBe(false);
  });
});

describe("a send's snapshot", () => {
  it("reads back what was kept", () => {
    const stored = {
      v: 1,
      title: "Rehearsal moved",
      body: "Thursday.",
      actionUrl: "/song-list",
      priority: "important",
      audience: selection({ named: ["musicians"] }),
      labels: { named: ["Musicians"], roles: [], instruments: [], people: [] },
      recipients: 4,
      senderName: "Alex Ball",
      template: { id: 3, name: "Rehearsal change" },
    };
    expect(parseSnapshot(stored)).toEqual(stored);
  });

  it("is not made of another event's payload, and never keeps a link off the site", () => {
    expect(parseSnapshot({ services: [{ anchor: "2026-10-11-am" }] })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ title: "x", actionUrl: "https://elsewhere.example/" })).toMatchObject({ title: "x", actionUrl: null, priority: "normal", recipients: 0, template: null });
  });
});

describe("push results, added up", () => {
  const attempt = (userId: string, status: DeliveryAttempt["status"], device = "Chrome on Windows"): DeliveryAttempt => ({ userId, device, status, attemptedAt: "2026-10-06T12:00:00.000Z" });

  it("counts attempts by outcome, and people by whether any reached them", () => {
    const summary = summarizeDeliveries(
      ["user_a", "user_b", "user_c", "user_d"],
      [attempt("user_a", "sent"), attempt("user_a", "sent", "Safari on iPhone"), attempt("user_b", "failed"), attempt("user_b", "sent", "Safari on iPhone"), attempt("user_c", "expired")],
    );
    expect(summary).toEqual({ attempts: 5, sent: 3, failed: 1, expired: 1, reached: 2, notAttempted: 1 });
  });

  it("is all zeroes when no push was attempted", () => {
    expect(summarizeDeliveries(["user_a", "user_b"], [])).toEqual({ attempts: 0, sent: 0, failed: 0, expired: 0, reached: 0, notAttempted: 2 });
  });
});
