import { describe, expect, it } from "vitest";

import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSION_FIXUPS, fixupGrants, resolvePermissions } from "@/lib/auth/permissions";

import { actor, director, john, mary, notificationStore } from "./__fixtures__/notifications";
import { AUDIENCES, needsEveryAccount, resolveAudience, users, type Directory } from "./audience";
import { relativeTime } from "./format";
import {
  CATEGORY_RELEVANCE,
  CHANNELS,
  COALESCE_MINUTES,
  DEFAULT_CATEGORIES,
  NOTIFICATION_LIMITS,
  allowedPolicies,
  badgeLabel,
  effectiveSetting,
  isRelevantCategory,
  normalizeBody,
  normalizeTitle,
  safeActionUrl,
} from "./model";
import {
  listNotifications,
  markAllRead,
  markRead,
  notify,
  policiesFor,
  preferencesFor,
  setPolicy,
  setPreference,
  unreadCount,
  type NotifyInput,
} from "./service";

const CATEGORY = "availability_changed";

/** Someone on the music team: the categories about services and availability concern them. */
const musician = (userId: string) => actor(userId, "view_availability", "view_service_plans");
/** Someone every starting category concerns. */
const everything = actor("user_everything", "view_availability", "view_service_plans", "use_ai");

/** A test notification to these people, in a category of the test's choosing. */
const send = (to: string[], extra: Partial<NotifyInput> = {}): NotifyInput => ({
  event: "system.test",
  category: CATEGORY,
  audience: users(...to),
  title: "Sunday's plan is ready",
  ...extra,
});

describe("the effective setting", () => {
  it("is on under a mandatory policy, whatever the person chose", () => {
    expect(effectiveSetting("in_app", "mandatory", false)).toEqual({ enabled: true, locked: true, available: true });
    expect(effectiveSetting("push", "mandatory", null)).toEqual({ enabled: true, locked: true, available: true });
  });

  it("follows the default until the person chooses", () => {
    expect(effectiveSetting("in_app", "default_on", null)).toEqual({ enabled: true, locked: false, available: true });
    expect(effectiveSetting("in_app", "default_on", false).enabled).toBe(false);
    expect(effectiveSetting("in_app", "default_off", null)).toEqual({ enabled: false, locked: false, available: true });
    expect(effectiveSetting("in_app", "default_off", true).enabled).toBe(true);
  });

  it("is off when unavailable, whatever is stored", () => {
    for (const stored of [true, false, null]) {
      expect(effectiveSetting("push", "unavailable", stored)).toEqual({ enabled: false, locked: true, available: false });
    }
  });

  it("never switches email on: it is not offered yet, whatever its policy or a stored choice says", () => {
    for (const policy of ["mandatory", "default_on", "default_off", "unavailable"] as const) {
      expect(effectiveSetting("email", policy, true)).toEqual({ enabled: false, locked: true, available: false });
    }
  });

  it("offers an administrator only 'unavailable' for email", () => {
    expect(allowedPolicies("email")).toEqual(["unavailable"]);
    expect(allowedPolicies("in_app")).toHaveLength(4);
    expect(allowedPolicies("push")).toHaveLength(4);
  });
});

describe("the starting categories", () => {
  it("start announcements as mandatory in the app and by push, and nothing by email", () => {
    const announcements = DEFAULT_CATEGORIES.find((category) => category.key === "admin_announcement");
    expect(announcements?.policies).toEqual({ in_app: "mandatory", push: "mandatory", email: "unavailable" });
    for (const category of DEFAULT_CATEGORIES) expect(category.policies.email).toBe("unavailable");
  });

  it("have a policy for every channel, and distinct keys", () => {
    expect(new Set(DEFAULT_CATEGORIES.map((category) => category.key)).size).toBe(DEFAULT_CATEGORIES.length);
    for (const category of DEFAULT_CATEGORIES) expect(Object.keys(category.policies).sort()).toEqual([...CHANNELS].sort());
  });
});

describe("a person's own choices", () => {
  it("shows every category to someone they all concern, with what is required locked and email unavailable", async () => {
    const { deps } = notificationStore();
    const mine = await preferencesFor(everything, deps);
    expect(mine.map((category) => category.key)).toEqual(DEFAULT_CATEGORIES.map((category) => category.key));
    const announcements = mine.find((category) => category.key === "admin_announcement")!;
    expect(announcements.channels.in_app).toEqual({ enabled: true, locked: true, available: true });
    expect(announcements.channels.email).toEqual({ enabled: false, locked: true, available: false });
    expect(mine.find((category) => category.key === CATEGORY)!.channels.in_app).toEqual({ enabled: true, locked: false, available: true });
  });

  it("stores only what the person chose, and only for them", async () => {
    const { deps, preferences } = notificationStore();
    const john = musician("user_john");
    const mary = musician("user_mary");
    expect(await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: false }, deps)).toEqual({ ok: true });
    expect(preferences).toEqual([{ userId: "user_john", category: CATEGORY, channel: "in_app", enabled: false }]);
    const forJohn = (await preferencesFor(john, deps)).find((category) => category.key === CATEGORY)!;
    const forMary = (await preferencesFor(mary, deps)).find((category) => category.key === CATEGORY)!;
    expect(forJohn.channels.in_app.enabled).toBe(false);
    expect(forMary.channels.in_app.enabled).toBe(true);
  });

  it("always writes the caller's own, whatever else the input carries", async () => {
    const { deps, preferences } = notificationStore();
    const input = { category: CATEGORY, channel: "push", enabled: false, userId: "user_mary" };
    expect(await setPreference(john, input, deps)).toEqual({ ok: true });
    expect(preferences.map((row) => row.userId)).toEqual(["user_john"]);
  });

  it("refuses a mandatory category, an unavailable channel, and anything malformed - writing nothing", async () => {
    const { deps, preferences } = notificationStore();
    expect(await setPreference(john, { category: "admin_announcement", channel: "in_app", enabled: false }, deps)).toEqual({ ok: false, problem: "locked" });
    expect(await setPreference(john, { category: CATEGORY, channel: "email", enabled: true }, deps)).toEqual({ ok: false, problem: "unavailable" });
    expect(await setPreference(john, { category: "no_such_category", channel: "in_app", enabled: false }, deps)).toEqual({ ok: false, problem: "unknown-category" });
    expect(await setPreference(john, { category: CATEGORY, channel: "carrier_pigeon", enabled: false }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: "no" }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(preferences).toEqual([]);
  });
});

describe("changing a policy", () => {
  it("needs manage_notifications", async () => {
    const { deps, policies } = notificationStore();
    const before = JSON.stringify(policies);
    expect(await setPolicy(john, { category: CATEGORY, channel: "in_app", policy: "mandatory" }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(await policiesFor(john, deps)).toBeNull();
    expect(JSON.stringify(policies)).toBe(before);
  });

  it("can make any category mandatory, and announcements optional: nothing is fixed in code", async () => {
    const { deps } = notificationStore();
    expect(await setPolicy(director, { category: "ai_system", channel: "push", policy: "mandatory" }, deps)).toEqual({ ok: true });
    expect(await setPolicy(director, { category: "admin_announcement", channel: "in_app", policy: "default_off" }, deps)).toEqual({ ok: true });
    const all = (await policiesFor(director, deps))!;
    expect(all.find((category) => category.key === "ai_system")!.policies.push).toBe("mandatory");
    expect(all.find((category) => category.key === "admin_announcement")!.policies.in_app).toBe("default_off");
    // And the person may now turn announcements on or off for themselves.
    expect(await setPreference(john, { category: "admin_announcement", channel: "in_app", enabled: true }, deps)).toEqual({ ok: true });
  });

  it("cannot make email available, and refuses what it does not know", async () => {
    const { deps, policies } = notificationStore();
    for (const policy of ["mandatory", "default_on", "default_off"]) {
      expect(await setPolicy(director, { category: CATEGORY, channel: "email", policy }, deps)).toEqual({ ok: false, problem: "not-allowed" });
    }
    expect(await setPolicy(director, { category: CATEGORY, channel: "in_app", policy: "sometimes" }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await setPolicy(director, { category: "no_such_category", channel: "in_app", policy: "mandatory" }, deps)).toEqual({ ok: false, problem: "unknown-category" });
    expect(policies.filter((row) => row.channel === "email").every((row) => row.policy === "unavailable")).toBe(true);
  });

  it("keeps a person's choice through mandatory and back", async () => {
    const { deps, stored } = notificationStore();
    const john = musician("user_john");
    const effective = async () => (await preferencesFor(john, deps)).find((category) => category.key === CATEGORY)!.channels.in_app;

    // 1. John turns a default-on category off.
    await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    expect((await effective()).enabled).toBe(false);

    // 2-4. It becomes mandatory: on for John, and his choice is still stored.
    await setPolicy(director, { category: CATEGORY, channel: "in_app", policy: "mandatory" }, deps);
    expect(await effective()).toEqual({ enabled: true, locked: true, available: true });
    expect(stored("user_john", CATEGORY, "in_app")).toBe(false);
    expect((await notify(send(["user_john"]), deps)).ok && (await unreadCount(john, deps))).toBe(1);
    // He cannot overwrite it while it is locked, either.
    expect(await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: true }, deps)).toEqual({ ok: false, problem: "locked" });
    expect(stored("user_john", CATEGORY, "in_app")).toBe(false);

    // 5-6. Back to default on: his choice counts again.
    await setPolicy(director, { category: CATEGORY, channel: "in_app", policy: "default_on" }, deps);
    expect(await effective()).toEqual({ enabled: false, locked: false, available: true });
    await notify(send(["user_john"]), deps);
    expect(await unreadCount(john, deps)).toBe(1);
  });

  it("keeps a choice through unavailable, too", async () => {
    const { deps, stored } = notificationStore();
    await setPreference(john, { category: CATEGORY, channel: "push", enabled: false }, deps);
    await setPolicy(director, { category: CATEGORY, channel: "push", policy: "unavailable" }, deps);
    expect(stored("user_john", CATEGORY, "push")).toBe(false);
    await setPolicy(director, { category: CATEGORY, channel: "push", policy: "default_on" }, deps);
    expect((await preferencesFor(musician("user_john"), deps)).find((category) => category.key === CATEGORY)!.channels.push.enabled).toBe(false);
  });
});

describe("which categories a person is asked about", () => {
  const keys = async (who: ReturnType<typeof actor>) => (await preferencesFor(who, notificationStore().deps)).map((category) => category.key);
  const FOR_EVERYONE = ["admin_announcement", "account_access", "sheet_music_report"];

  it("leaves out what could never reach them", async () => {
    // A member with no part in the music: announcements, their account, sheet music.
    expect(await keys(john)).toEqual(FOR_EVERYONE);
    expect(await keys(musician("user_john"))).toEqual([
      "admin_announcement",
      "service_plan_published",
      "service_plan_updated",
      "availability_changed",
      "account_access",
      "sheet_music_report",
    ]);
    expect(await keys(actor("user_x", "use_ai"))).toEqual([...FOR_EVERYONE, "ai_system"]);
    expect(await keys(actor("user_x", "manage_availability"))).toContain("availability_changed");
    expect(await keys(actor("user_x", "manage_service_plans"))).toContain("service_plan_updated");
  });

  it("always shows a category nothing is said about, such as one added later", () => {
    expect(isRelevantCategory("choir_news", () => false)).toBe(true);
    expect(isRelevantCategory("ai_system", () => false)).toBe(false);
    for (const key of Object.keys(CATEGORY_RELEVANCE)) expect(DEFAULT_CATEGORIES.map((category) => category.key)).toContain(key);
  });

  it("decides nothing else: a hidden category can still be chosen, and still delivers", async () => {
    const { deps, rows } = notificationStore();
    // John is not asked about AI and system, yet a choice he makes is kept, not refused...
    expect((await preferencesFor(john, deps)).some((category) => category.key === "ai_system")).toBe(false);
    expect(await setPreference(john, { category: "ai_system", channel: "push", enabled: true }, deps)).toEqual({ ok: true });
    // ...and a notification addressed to him in it arrives all the same.
    expect(await notify(send(["user_john"], { category: "ai_system" }), deps)).toMatchObject({ ok: true, recipients: 1 });
    expect(rows.map((row) => row.recipient)).toEqual(["user_john"]);
    // Nor does being asked about a category grant anything: relevance never appears among what an actor may do.
    expect(john.can("use_ai")).toBe(false);
    expect(john.can("manage_notifications")).toBe(false);
  });
});

describe("folding related notifications", () => {
  /** An event that folds (the catalog's availability.service_changed), about `entity`. */
  const change = (title: string, entity = "user_john:2026-10-18-am", extra: Partial<NotifyInput> = {}): NotifyInput => ({
    event: "availability.service_changed",
    audience: users("user_director", "user_mary"),
    title,
    entity: { type: "availability", id: entity },
    ...extra,
  });
  const reader = actor("user_director");
  const titles = async (deps: Parameters<typeof notify>[1], who = reader) => (await listNotifications(who, {}, deps)).items.map((item) => item.title);

  it("replaces an unread notification about the same thing, and keeps every event", async () => {
    const { deps, events, advance } = notificationStore();
    await notify(change("First"), deps);
    advance(5);
    await notify(change("Second"), deps);
    expect(events.map((event) => event.title)).toEqual(["First", "Second"]);
    expect(await titles(deps)).toEqual(["Second"]);
    expect(await unreadCount(reader, deps)).toBe(1);
    expect(await titles(deps, mary)).toEqual(["Second"]);
  });

  it("uses the wording for a folded notification only where one was replaced", async () => {
    const { deps } = notificationStore();
    await notify(change("First", undefined, { audience: users("user_director") }), deps);
    await notify(change("Second", undefined, { whenCoalesced: { title: "Several changes", body: "More than one." } }), deps);
    expect((await listNotifications(reader, {}, deps)).items[0]).toMatchObject({ title: "Several changes", body: "More than one." });
    // Mary had nothing to replace: she is told what happened.
    expect(await titles(deps, mary)).toEqual(["Second"]);
  });

  it("never touches a notification already read", async () => {
    const { deps } = notificationStore();
    await notify(change("First"), deps);
    await markAllRead(reader, deps);
    await notify(change("Second"), deps);
    expect(await titles(deps)).toEqual(["Second", "First"]);
    expect(await unreadCount(reader, deps)).toBe(1);
    // Mary had not read hers, so hers was replaced.
    expect(await titles(deps, mary)).toEqual(["Second"]);
  });

  it("starts afresh after the window, for another entity, and for another family", async () => {
    const { deps, advance } = notificationStore();
    await notify(change("First"), deps);
    advance(COALESCE_MINUTES + 1);
    await notify(change("Later"), deps);
    await notify(change("Another service", "user_john:2026-10-18-pm"), deps);
    await notify(change("Their range", "user_john:2026-10-18-am", { event: "availability.range_changed" }), deps);
    expect(await titles(deps)).toEqual(["Their range", "Another service", "Later", "First"]);
  });

  it("does not fold an event that says nothing of what it is about, or one that never folds", async () => {
    const { deps } = notificationStore();
    await notify({ ...change("One"), entity: null }, deps);
    await notify({ ...change("Two"), entity: null }, deps);
    await notify(send(["user_director"], { title: "Test one", entity: { type: "x", id: "1" } }), deps);
    await notify(send(["user_director"], { title: "Test two", entity: { type: "x", id: "1" } }), deps);
    expect(await titles(deps)).toEqual(["Test two", "Test one", "Two", "One"]);
  });

  it("refuses folded wording that could not be a notification", async () => {
    const { deps, events } = notificationStore();
    expect(await notify(change("First", undefined, { whenCoalesced: { title: " " } }), deps)).toEqual({ ok: false, problem: "invalid" });
    expect(events).toEqual([]);
  });
});

describe("notify", () => {
  it("records one event and one notification per recipient, as written", async () => {
    const { deps, events, rows } = notificationStore();
    const result = await notify(
      send(["user_john", "user_mary", "user_john"], { body: "  Three hymns and a psalm.  ", actionUrl: "/song-list", actorUserId: "user_director", entity: { type: "service", id: "2026-10-11-am" } }),
      deps,
    );
    expect(result).toEqual({ ok: true, eventId: 1, recipients: 2 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: CATEGORY, eventKey: "system.test", actorUserId: "user_director", entityType: "service", entityId: "2026-10-11-am" });
    expect(rows.map((row) => row.recipient).sort()).toEqual(["user_john", "user_mary"]);
    expect(rows[0]).toMatchObject({ title: "Sunday's plan is ready", body: "Three hymns and a psalm.", actionUrl: "/song-list", priority: "normal", readAt: null });
  });

  it("uses the event's own category and link when none is given", async () => {
    const { deps, rows } = notificationStore();
    await notify({ event: "system.test", audience: users("user_john"), title: "Hello" }, deps);
    expect(rows[0]).toMatchObject({ category: "ai_system", actionUrl: "/notifications" });
  });

  it("leaves out someone who turned the category off, and whoever is excepted", async () => {
    const { deps, rows } = notificationStore();
    // Off on every channel that delivers. (The app's alone would leave her told by push: delivery.test.ts.)
    await setPreference(mary, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    await setPreference(mary, { category: CATEGORY, channel: "push", enabled: false }, deps);
    const result = await notify(send(["user_john", "user_mary", "user_director"], { except: ["user_director"] }), deps);
    expect(result).toMatchObject({ ok: true, recipients: 1 });
    expect(rows.map((row) => row.recipient)).toEqual(["user_john"]);
  });

  it("still reaches someone who turned a mandatory category's neighbour off", async () => {
    const { deps } = notificationStore();
    await setPreference(mary, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    await notify(send(["user_mary"], { category: "admin_announcement" }), deps);
    expect(await unreadCount(mary, deps)).toBe(1);
  });

  it("refuses an unknown or retired category, an empty title, and a link off the site", async () => {
    const { deps, categories, events } = notificationStore();
    expect(await notify(send(["user_john"], { category: "no_such_category" }), deps)).toEqual({ ok: false, problem: "unknown-category" });
    categories.find((category) => category.key === CATEGORY)!.active = false;
    expect(await notify(send(["user_john"]), deps)).toEqual({ ok: false, problem: "unknown-category" });
    expect(await notify(send(["user_john"], { category: "ai_system", title: "   " }), deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await notify(send(["user_john"], { category: "ai_system", actionUrl: "https://elsewhere.example/" }), deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await notify({ ...send(["user_john"]), event: "no.such.event" as never }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(events).toEqual([]);
  });

  it("resolves an audience from roles and permissions, asking for every account only when it must", async () => {
    const { deps, rows, calls } = notificationStore({
      userRoles: { user_john: ["musician"], user_mary: ["song_leader"], user_director: ["music_director"], user_admin: ["administrator"] },
      accountIds: ["user_john", "user_mary", "user_director", "user_admin", "user_member"],
    });
    await notify({ ...send([]), audience: AUDIENCES.musicTeam }, deps);
    expect(rows.map((row) => row.recipient).sort()).toEqual(["user_director", "user_john", "user_mary"]);
    expect(calls.accounts).toBe(0);

    rows.length = 0;
    await notify({ ...send([]), audience: AUDIENCES.everyone }, deps);
    expect(rows.map((row) => row.recipient).sort()).toEqual(["user_admin", "user_director", "user_john", "user_mary", "user_member"]);
    expect(calls.accounts).toBe(1);
  });
});

describe("reading", () => {
  it("counts unread, and follows read, unread and mark all", async () => {
    const { deps } = notificationStore();
    for (const title of ["One", "Two", "Three"]) await notify(send(["user_john"], { title }), deps);
    expect(await unreadCount(john, deps)).toBe(3);

    const page = await listNotifications(john, {}, deps);
    expect(page.items.map((item) => item.title)).toEqual(["Three", "Two", "One"]);
    expect(page.unread).toBe(3);

    const [newest] = page.items;
    expect(await markRead(john, { id: newest.id, read: true }, deps)).toEqual({ ok: true, unread: 2 });
    // Reading it again changes nothing.
    expect(await markRead(john, { id: newest.id, read: true }, deps)).toEqual({ ok: true, unread: 2 });
    expect(await markRead(john, { id: newest.id, read: false }, deps)).toEqual({ ok: true, unread: 3 });
    expect(await markAllRead(john, deps)).toEqual({ ok: true, unread: 0 });
    expect((await listNotifications(john, {}, deps)).items.every((item) => item.readAt !== null)).toBe(true);
  });

  it("never lets one person read, count or mark another's", async () => {
    const { deps, rows } = notificationStore();
    await notify(send(["user_john"]), deps);
    const id = rows[0].id;

    expect((await listNotifications(mary, {}, deps)).items).toEqual([]);
    expect(await unreadCount(mary, deps)).toBe(0);
    expect(await markRead(mary, { id, read: true }, deps)).toEqual({ ok: false, problem: "not-found" });
    await markAllRead(mary, deps);
    expect(rows[0].readAt).toBeNull();
    expect(await unreadCount(john, deps)).toBe(1);
    // Not even someone who configures notifications.
    expect(await markRead(director, { id, read: true }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await markRead(john, { id: "1", read: true }, deps)).toEqual({ ok: false, problem: "invalid" });
  });

  it("pages through a long history without loading it all", async () => {
    const { deps } = notificationStore();
    for (let index = 1; index <= 7; index += 1) await notify(send(["user_john"], { title: `Number ${index}` }), deps);

    const first = await listNotifications(john, { limit: 3 }, deps);
    expect(first.items.map((item) => item.title)).toEqual(["Number 7", "Number 6", "Number 5"]);
    expect(first.nextCursor).toBe(first.items[2].id);
    const second = await listNotifications(john, { before: first.nextCursor, limit: 3 }, deps);
    expect(second.items.map((item) => item.title)).toEqual(["Number 4", "Number 3", "Number 2"]);
    const last = await listNotifications(john, { before: second.nextCursor, limit: 3 }, deps);
    expect(last.items.map((item) => item.title)).toEqual(["Number 1"]);
    expect(last.nextCursor).toBeNull();
    // However much is asked for, a page has a ceiling.
    expect((await listNotifications(john, { limit: 10_000 }, deps)).items).toHaveLength(7);
    expect(NOTIFICATION_LIMITS.maxPage).toBeLessThanOrEqual(50);
  });
});

describe("audiences", () => {
  const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
  const directory: Directory = {
    userRoles: new Map([
      ["user_john", ["musician"]],
      ["user_mary", ["song_leader"]],
      ["user_director", ["music_director"]],
      ["user_admin", ["administrator"]],
    ]),
    rolePermissions,
    overrides: new Map([["user_helper", [{ permission: "manage_users", effect: "grant" as const }]]]),
    accountIds: [],
  };
  const everyone: Directory = { ...directory, accountIds: ["user_john", "user_mary", "user_director", "user_admin", "user_helper", "user_member"] };
  const sorted = (ids: string[]) => [...ids].sort();

  it("finds people by permission, counting individual grants and the administrator", () => {
    expect(sorted(resolveAudience(AUDIENCES.planners, directory))).toEqual(["user_admin", "user_director"]);
    expect(sorted(resolveAudience(AUDIENCES.accountManagers, directory))).toEqual(["user_admin", "user_helper"]);
  });

  it("keeps an administrator out of the music team unless a role puts them there", () => {
    expect(sorted(resolveAudience(AUDIENCES.musicTeam, directory))).toEqual(["user_director", "user_john", "user_mary"]);
  });

  it("finds people by role, named people, and any of several - each once", () => {
    expect(resolveAudience(AUDIENCES.musicians, directory)).toEqual(["user_john"]);
    expect(resolveAudience(AUDIENCES.administrators, directory)).toEqual(["user_admin"]);
    expect(sorted(resolveAudience(users("user_x", "user_x", "user_john"), directory))).toEqual(["user_john", "user_x"]);
    expect(sorted(resolveAudience({ kind: "any", of: [AUDIENCES.musicians, AUDIENCES.songLeaders, users("user_john")] }, directory))).toEqual(["user_john", "user_mary"]);
  });

  it("leaves out whoever is excepted", () => {
    expect(sorted(resolveAudience(AUDIENCES.musicTeam, directory, ["user_director"]))).toEqual(["user_john", "user_mary"]);
  });

  it("reaches Member-only accounts only through the list of every account", () => {
    expect(needsEveryAccount(AUDIENCES.everyone, rolePermissions)).toBe(true);
    expect(needsEveryAccount({ kind: "permission", permission: "view_sheet_music" }, rolePermissions)).toBe(true);
    expect(needsEveryAccount(AUDIENCES.planners, rolePermissions)).toBe(false);
    expect(needsEveryAccount({ kind: "any", of: [AUDIENCES.musicians, AUDIENCES.everyone] }, rolePermissions)).toBe(true);
    expect(sorted(resolveAudience(AUDIENCES.everyone, everyone))).toEqual(sorted([...everyone.accountIds]));
    expect(resolveAudience({ kind: "permission", permission: "view_sheet_music" }, everyone)).toContain("user_member");
  });
});

describe("what a notification may hold", () => {
  it("tidies a title and a body, and refuses what is too long", () => {
    expect(normalizeTitle("  Sunday's   plan\n is ready ")).toBe("Sunday's plan is ready");
    expect(normalizeTitle("")).toBeNull();
    expect(normalizeTitle(7)).toBeNull();
    expect(normalizeTitle("x".repeat(NOTIFICATION_LIMITS.titleChars + 1))).toBeNull();
    expect(normalizeBody(undefined)).toBe("");
    expect(normalizeBody(" One.\n\n\n\nTwo. ")).toBe("One.\n\nTwo.");
    expect(normalizeBody("x".repeat(NOTIFICATION_LIMITS.bodyChars + 1))).toBeNull();
  });

  it("only ever links to a page on this site", () => {
    expect(safeActionUrl("/service-planner/2026-10-11-am")).toBe("/service-planner/2026-10-11-am");
    expect(safeActionUrl("/availability?view=me")).toBe("/availability?view=me");
    expect(safeActionUrl(undefined)).toBeNull();
    expect(safeActionUrl("")).toBeNull();
    for (const elsewhere of ["https://elsewhere.example", "//elsewhere.example", "/\\elsewhere.example", "javascript:alert(1)", "dashboard", 7]) {
      expect(safeActionUrl(elsewhere)).toBeUndefined();
    }
  });

  it("keeps the bell's count short", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(-3)).toBe("");
    expect(badgeLabel(4)).toBe("4");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
    expect(badgeLabel(12_345)).toBe("99+");
  });

  it("writes times as people say them", () => {
    const now = Date.parse("2026-10-06T19:00:00.000Z");
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(relativeTime(ago(20_000), now)).toBe("Just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 hr ago");
    expect(relativeTime(ago(30 * 3_600_000), now)).toBe("Yesterday");
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe("4 days ago");
    expect(relativeTime("2026-09-03T19:00:00.000Z", now)).toBe("Sep 3");
    expect(relativeTime("2025-12-25T19:00:00.000Z", now)).toBe("Dec 25, 2025");
    // A clock a little behind never reads as the future.
    expect(relativeTime(ago(-5_000), now)).toBe("Just now");
  });
});

describe("manage_notifications", () => {
  const rolePermissions = new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]]));
  const has = (roles: string[]) => resolvePermissions(roles, rolePermissions).has("manage_notifications");

  it("is held by administrators and the Music Director, and nobody else by default", () => {
    expect(ALL_PERMISSIONS).toContain("manage_notifications");
    expect(has(["administrator"])).toBe(true);
    expect(has(["music_director"])).toBe(true);
    for (const role of ["musician", "song_leader", "member"]) expect(has([role])).toBe(false);
  });

  it("is granted once to the existing Music Director role only", () => {
    const fixup = PERMISSION_FIXUPS.find((item) => item.permissions.includes("manage_notifications"));
    expect(fixup).toBeDefined();
    expect(fixupGrants(fixup!.permissions)).toEqual([{ role: "music_director", permission: "manage_notifications" }]);
  });

  it("is what the fixture's director holds, and john does not", () => {
    expect(director.can("manage_notifications")).toBe(true);
    expect(john.can("manage_notifications")).toBe(false);
    expect(actor("user_x", "manage_users").can("manage_notifications")).toBe(false);
  });
});
