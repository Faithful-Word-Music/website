import { describe, expect, it } from "vitest";

import { regularOccurrences } from "@/lib/availability/occurrences";

import { TEAM, actor, notificationStore } from "../__fixtures__/notifications";
import { NOTIFICATION_EVENTS, type NotificationEventKey } from "../catalog";
import { CHANNEL_STATUS, safeActionUrl } from "../model";
import { listNotifications, notify, notifySafely, type NotificationDeps, type NotifyInput } from "../service";
import { accountAccessChanged, accountRequestCreated } from "./account";
import { availabilityNormalChanged, availabilityRangeChanged, availabilityServiceChanged } from "./availability";
import { libraryIndexProblem } from "./library";
import {
  servicePlanPublished,
  servicePlanStatusChanged,
  servicePlanUpdated,
  servicePlansWithdrawnByInsert,
  type ServiceRef,
} from "./service-plan";

const NOW = Date.parse("2026-10-06T12:00:00-07:00");
const DIRECTOR = "user_director";
const sundayAm: ServiceRef = { date: "2026-10-11", slot: "AM", startsAt: "2026-10-11T10:30:00-07:00", label: null };
const [occurrence] = regularOccurrences("2026-10-18", "2026-10-18");
const JOHN = { id: "user_john", name: "John" };

const told = (rows: Array<{ recipient: string }>) => rows.map((row) => row.recipient).sort();

describe("account requests", () => {
  it("tell whoever reviews them, naming nobody", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    const input = accountRequestCreated({ created: true, id: 42 });
    await notify(input!, deps);

    expect(events[0]).toMatchObject({ eventKey: "account.request_created", category: "account_access", entityType: "account-request", entityId: "42", priority: "important" });
    // The administrator, and the person granted manage_users on their own.
    expect(told(rows)).toEqual(["user_admin", "user_helper"]);
    expect(rows[0]).toMatchObject({
      title: "New account request",
      body: "A new request for a Faithful Word Music account is waiting for review.",
      actionUrl: "/admin/requests/42",
    });
  });

  it("say nothing of a request dropped as a duplicate", () => {
    expect(accountRequestCreated({ created: false })).toBeNull();
  });
});

describe("account access", () => {
  it("tells the person once for a whole save of roles", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await notify(accountAccessChanged({ actorId: "user_admin", userId: "user_john", changed: true })!, deps);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventKey: "account.access_changed", entityType: "account", entityId: "user_john", priority: "important" });
    expect(told(rows)).toEqual(["user_john"]);
    expect(rows[0]).toMatchObject({ title: "Your account access changed", body: "Your Faithful Word Music roles or permissions were updated.", actionUrl: "/profile" });
  });

  it("folds a roles save and an exception soon after into one", async () => {
    const { deps, events, advance } = notificationStore(TEAM);
    const change = accountAccessChanged({ actorId: "user_admin", userId: "user_john", changed: true })!;
    await notify(change, deps);
    advance(3);
    await notify(change, deps);
    expect(events).toHaveLength(2);
    expect((await listNotifications(actor("user_john"), {}, deps)).items).toHaveLength(1);
  });

  it("says nothing when nothing changed, or when someone changed their own", () => {
    expect(accountAccessChanged({ actorId: "user_admin", userId: "user_john", changed: false })).toBeNull();
    expect(accountAccessChanged({ actorId: "user_admin", userId: "user_admin", changed: true })).toBeNull();
  });

  it("reaches someone who switched the category off: it is mandatory in the app", async () => {
    const { deps, preferences, rows } = notificationStore(TEAM);
    // A choice left over from when the category was not mandatory.
    preferences.push({ userId: "user_john", category: "account_access", channel: "in_app", enabled: false });
    await notify(accountAccessChanged({ actorId: "user_admin", userId: "user_john", changed: true })!, deps);
    expect(told(rows)).toEqual(["user_john"]);
  });
});

describe("the library index", () => {
  it("tells the others who use AI when files newly failed - not whoever pressed Refresh", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await notify(libraryIndexProblem({ actorId: DIRECTOR, newlyFailed: 2, failed: 3 })!, deps);
    expect(events[0]).toMatchObject({ eventKey: "ai.library_index_problem", category: "ai_system", entityType: "library-index", priority: "important" });
    expect(told(rows)).toEqual(["user_admin", "user_assistant"]);
    expect(rows[0]).toMatchObject({
      title: "Library index needs attention",
      body: "3 song files could not be indexed. Review the library index status.",
      actionUrl: "/admin/ai",
    });
  });

  it("says nothing when no file newly failed, and folds the passes of one refresh", async () => {
    expect(libraryIndexProblem({ actorId: DIRECTOR, newlyFailed: 0, failed: 3 })).toBeNull();
    const { deps, advance } = notificationStore(TEAM);
    await notify(libraryIndexProblem({ actorId: DIRECTOR, newlyFailed: 1, failed: 1 })!, deps);
    advance(5);
    await notify(libraryIndexProblem({ actorId: DIRECTOR, newlyFailed: 1, failed: 2 })!, deps);
    const mine = await listNotifications(actor("user_assistant"), {}, deps);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].body).toBe("2 song files could not be indexed. Review the library index status.");
  });
});

describe("every real event", () => {
  /** One of each, as a feature would build it. */
  const samples: NotifyInput[] = [
    servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [sundayAm], now: NOW })!,
    servicePlanUpdated({ actorId: DIRECTOR, service: sundayAm, changes: [{ type: "removed", title: "Psalm 120", position: 3 }], startsAtBefore: sundayAm.startsAt, now: NOW })!,
    servicePlanStatusChanged({ actorId: DIRECTOR, before: "published", after: "draft", service: sundayAm, now: NOW })!,
    servicePlansWithdrawnByInsert({ actorId: DIRECTOR, weekStart: "2026-10-11", services: [sundayAm, { ...sundayAm, slot: "PM" }], now: NOW })!,
    servicePlanStatusChanged({ actorId: DIRECTOR, before: "draft", after: "cancelled", service: sundayAm, now: NOW })!,
    servicePlanStatusChanged({ actorId: DIRECTOR, before: "cancelled", after: "draft", service: sundayAm, now: NOW })!,
    ...availabilityServiceChanged({ actorId: DIRECTOR, person: JOHN, normal: ["sunday_am"], occurrence, exception: null, choice: "unavailable" }),
    ...availabilityRangeChanged({
      actorId: DIRECTOR,
      person: JOHN,
      normal: ["sunday_am"],
      from: "2026-10-18",
      to: "2026-10-18",
      occurrences: [occurrence],
      exceptions: new Map(),
      choice: "unavailable",
    }),
    ...availabilityNormalChanged({ actorId: DIRECTOR, person: JOHN, before: ["sunday_am"], after: [] }),
    accountRequestCreated({ created: true, id: 7 })!,
    accountAccessChanged({ actorId: "user_admin", userId: "user_john", changed: true })!,
    libraryIndexProblem({ actorId: DIRECTOR, newlyFailed: 1, failed: 1 })!,
  ];

  it("is built by a feature, and says what it is about", () => {
    const real = (Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[]).filter((key) => key !== "system.test");
    expect([...new Set(samples.map((sample) => sample.event))].sort()).toEqual([...real].sort());
    for (const sample of samples) {
      expect(sample.entity?.type, sample.event).toBeTruthy();
      expect(sample.entity?.id, sample.event).toBeTruthy();
    }
  });

  it("has a concise title, and leads only to a page on this site", async () => {
    const { deps } = notificationStore(TEAM);
    for (const sample of samples) {
      expect(sample.title).not.toMatch(/notification|event|action has occurred/i);
      const link = sample.actionUrl ?? NOTIFICATION_EVENTS[sample.event].actionUrl;
      expect(safeActionUrl(link), sample.event).toBe(link);
      expect((await notify(sample, deps)).ok, sample.event).toBe(true);
    }
    expect(await notify({ ...samples[0], actionUrl: "https://elsewhere.example/" }, deps)).toEqual({ ok: false, problem: "invalid" });
  });

  it("keeps its payload on the server: what a person is shown has no trace of it", async () => {
    const { deps, events } = notificationStore(TEAM);
    await notify(samples[0], deps);
    expect(events[0].payload).toMatchObject({ services: [{ anchor: "2026-10-11-am" }] });
    const [item] = (await listNotifications(actor("user_john"), {}, deps)).items;
    expect(Object.keys(item).sort()).toEqual(["actionUrl", "body", "category", "createdAt", "id", "priority", "readAt", "title"]);
    expect(JSON.stringify(item)).not.toContain("anchor");
  });

  it("is delivered in the app and by push, and never by email", async () => {
    expect(CHANNEL_STATUS).toEqual({ in_app: "live", push: "live", email: "soon" });
    const { deps, preferences, rows, sent, device } = notificationStore(TEAM);
    for (const userId of ["user_john", "user_mary", "user_assistant"]) device(userId);
    // In the app off, push on: John is told, by push alone.
    preferences.push({ userId: "user_john", category: "service_plan_published", channel: "in_app", enabled: false });
    preferences.push({ userId: "user_john", category: "service_plan_published", channel: "push", enabled: true });
    preferences.push({ userId: "user_john", category: "service_plan_published", channel: "email", enabled: true });
    // Push off, in the app on: Mary is told in the app alone.
    preferences.push({ userId: "user_mary", category: "service_plan_published", channel: "push", enabled: false });
    await notify(samples[0], deps);
    expect(told(rows)).toEqual(["user_assistant", "user_john", "user_mary"]);
    expect(rows.find((row) => row.recipient === "user_john")!.inApp).toBe(false);
    expect((await listNotifications(actor("user_john"), {}, deps)).items).toEqual([]);
    expect(sent.map((message) => message.userId).sort()).toEqual(["user_assistant", "user_john"]);
    // And nothing in what notify() is given can send an email.
    expect(Object.keys(deps).some((name) => /email|mail/i.test(name))).toBe(false);
  });

  it("is pushed with nothing of its payload, and only ever to a page on this site", async () => {
    const { deps, sent, device } = notificationStore(TEAM);
    for (const userId of TEAM.accountIds) device(userId);
    for (const sample of samples) await notify(sample, deps);
    expect(sent.length).toBeGreaterThan(0);
    for (const { payload } of sent) {
      expect(Object.keys(payload).sort()).toEqual(["body", "id", "priority", "tag", "title", "unread", "url", "v"]);
      expect(safeActionUrl(payload.url)).toBe(payload.url);
      expect(JSON.stringify(payload)).not.toContain("anchor");
    }
  });
});

describe("best effort", () => {
  const failing = (deps: NotificationDeps): NotificationDeps => ({
    ...deps,
    record: async () => {
      throw new Error("the database is away");
    },
  });

  it("never throws back into the action it is about", async () => {
    const { deps } = notificationStore(TEAM);
    const sample = accountRequestCreated({ created: true, id: 1 })!;
    await expect(notifySafely(sample, failing(deps))).resolves.toBeUndefined();
    await expect(notifySafely(sample, { ...deps, loadDirectory: async () => Promise.reject(new Error("no roles")) })).resolves.toBeUndefined();
    // A notification notify() refuses is not an error either.
    await expect(notifySafely({ ...sample, title: " " }, deps)).resolves.toBeUndefined();
  });

  it("does nothing when there is nothing to say, and sends when there is", async () => {
    const { deps, events } = notificationStore(TEAM);
    await notifySafely(null, deps);
    expect(events).toEqual([]);
    await notifySafely(accountRequestCreated({ created: true, id: 1 }), deps);
    expect(events).toHaveLength(1);
  });
});
