import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ServiceAvailability } from "@/lib/auth/profile-options";
import type { AvailabilityChoice, ExceptionStatus } from "@/lib/availability/effective";
import { occurrenceKey, regularOccurrences } from "@/lib/availability/occurrences";

import { TEAM, actor, notificationStore } from "../__fixtures__/notifications";
import { listNotifications, notify, type NotifyInput } from "../service";
import { availabilityNormalChanged, availabilityRangeChanged, availabilityServiceChanged } from "./availability";

const JOHN = { id: "user_john", name: "John" };
const NORMAL: ServiceAvailability[] = ["sunday_am", "sunday_pm"];
const [sundayAm] = regularOccurrences("2026-10-18", "2026-10-18");
const director = actor("user_director");

/** John's Sunday morning, changed by `actorId` (himself unless a leader is named). */
const service = (choice: AvailabilityChoice, exception: ExceptionStatus | null = null, actorId = JOHN.id) =>
  availabilityServiceChanged({ actorId, person: JOHN, normal: NORMAL, occurrence: sundayAm, exception, choice });

const range = (choice: AvailabilityChoice, actorId = JOHN.id, exceptions = new Map<string, ExceptionStatus>()) =>
  availabilityRangeChanged({
    actorId,
    person: JOHN,
    normal: NORMAL,
    from: "2026-10-18",
    to: "2026-10-25",
    occurrences: regularOccurrences("2026-10-18", "2026-10-25"),
    exceptions,
    choice,
  });

type Store = ReturnType<typeof notificationStore>;
async function sendAll(inputs: NotifyInput[], deps: Store["deps"]) {
  for (const input of inputs) expect((await notify(input, deps)).ok).toBe(true);
}
const told = (rows: Store["rows"]) => rows.map((row) => row.recipient).sort();

describe("one service", () => {
  it("tells whoever looks after availability when someone changes their own - and nobody else", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await sendAll(service("unavailable"), deps);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventKey: "availability.service_changed",
      category: "availability_changed",
      entityType: "availability",
      entityId: "user_john:2026-10-18-am",
      actorUserId: "user_john",
      priority: "normal",
    });
    // The two leaders: not John himself, not Mary (a song leader), not the administrator, who only holds everything.
    expect(told(rows)).toEqual(["user_assistant", "user_director"]);
    expect(rows[0]).toMatchObject({
      title: "John is unavailable for Sunday Morning",
      body: "Availability changed for Sunday, October 18.",
      actionUrl: "/availability?month=2026-10&person=user_john",
    });
  });

  it("leaves out a leader who changed their own", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await sendAll(
      availabilityServiceChanged({ actorId: "user_director", person: { id: "user_director", name: "Dana" }, normal: NORMAL, occurrence: sundayAm, exception: null, choice: "unavailable" }),
      deps,
    );
    expect(told(rows)).toEqual(["user_assistant"]);
  });

  it("tells the person, and the other leaders, when a leader changes someone else's", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await sendAll(service("unavailable", null, "user_director"), deps);

    expect(events).toHaveLength(2);
    expect(told(rows)).toEqual(["user_assistant", "user_john"]);
    expect(rows.find((row) => row.recipient === "user_john")).toMatchObject({
      title: "Your availability was changed",
      body: "You are now unavailable for Sunday Morning, Sunday, October 18.",
      actionUrl: "/availability?month=2026-10&view=me",
    });
    expect(rows.find((row) => row.recipient === "user_assistant")).toMatchObject({
      title: "John's availability changed",
      body: "John is now unavailable for Sunday Morning, Sunday, October 18.",
    });
  });

  it("says nothing when the choice changes nothing", () => {
    // Already normally there; already away by exception; "normal" with nothing to undo.
    expect(service("available")).toEqual([]);
    expect(service("unavailable", "unavailable")).toEqual([]);
    expect(service("normal")).toEqual([]);
    // But undoing an exception is a change.
    expect(service("normal", "unavailable")).toHaveLength(1);
    expect(service("normal", "unavailable")[0].title).toBe("John is back to normal for Sunday Morning");
  });

  it("falls back to a neutral name, and never carries the person's note", () => {
    const [input] = availabilityServiceChanged({ actorId: "user_john", person: { id: "user_john", name: " " }, normal: NORMAL, occurrence: sundayAm, exception: null, choice: "unavailable" });
    expect(input.title).toBe("A team member is unavailable for Sunday Morning");
    expect(JSON.stringify(input)).not.toContain("note");
  });

  it("folds quick corrections for the same person and service into one, showing the latest", async () => {
    const { deps, events, advance } = notificationStore(TEAM);
    await sendAll(service("unavailable"), deps);
    advance(1);
    await sendAll(service("normal", "unavailable"), deps);
    advance(1);
    await sendAll(service("unavailable"), deps);

    expect(events).toHaveLength(3);
    const mine = await listNotifications(director, {}, deps);
    expect(mine.items).toHaveLength(1);
    expect(mine.unread).toBe(1);
    expect(mine.items[0].title).toBe("John is unavailable for Sunday Morning");

    // Another person's change, or another service, stands on its own.
    await sendAll(
      availabilityServiceChanged({ actorId: "user_mary", person: { id: "user_mary", name: "Mary" }, normal: NORMAL, occurrence: sundayAm, exception: null, choice: "unavailable" }),
      deps,
    );
    expect((await listNotifications(director, {}, deps)).items).toHaveLength(2);
  });
});

describe("a date range", () => {
  it("is one notification, not one per service", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await sendAll(range("unavailable"), deps);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventKey: "availability.range_changed", entityType: "availability-range", entityId: "user_john:2026-10-18_2026-10-25" });
    // Two Sundays, morning and evening: the Wednesday is not one of his normal services, so it does not change.
    expect(events[0].payload).toMatchObject({ services: ["2026-10-18-am", "2026-10-18-pm", "2026-10-25-am", "2026-10-25-pm"] });
    expect(told(rows)).toEqual(["user_assistant", "user_director"]);
    expect(rows[0]).toMatchObject({
      title: "John reported an absence",
      body: "John is unavailable October 18 to October 25, affecting 4 services.",
    });
  });

  it("counts only the services it really changed, and says nothing when there are none", () => {
    const already = new Map<string, ExceptionStatus>([[occurrenceKey("2026-10-18", "AM"), "unavailable"]]);
    expect(range("unavailable", JOHN.id, already)[0].body).toBe("John is unavailable October 18 to October 25, affecting 3 services.");
    expect(range("normal")).toEqual([]);
    expect(range("normal", JOHN.id, already)[0]).toMatchObject({
      title: "John's availability changed",
      body: "John is back to normal October 18 to October 25, affecting 1 service.",
    });
  });

  it("tells the person too when a leader entered it", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await sendAll(range("unavailable", "user_director"), deps);
    expect(told(rows)).toEqual(["user_assistant", "user_john"]);
    expect(rows.find((row) => row.recipient === "user_john")).toMatchObject({
      title: "Your availability was changed",
      body: "You are now unavailable October 18 to October 25, affecting 4 services.",
    });
  });
});

describe("normal services", () => {
  const normal = (after: ServiceAvailability[], actorId = JOHN.id) => availabilityNormalChanged({ actorId, person: JOHN, before: NORMAL, after });

  it("tells the leaders when someone changes their usual services", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await sendAll(normal(["sunday_am", "wednesday_pm"]), deps);
    expect(events[0]).toMatchObject({ eventKey: "availability.normal_changed", entityType: "availability-user", entityId: "user_john", priority: "normal" });
    expect(told(rows)).toEqual(["user_assistant", "user_director"]);
    expect(rows[0]).toMatchObject({ title: "John changed their normal services", body: "John now normally serves: Sunday morning, Wednesday evening." });
  });

  it("tells the person when a leader changed them, and says nothing when the set is the same", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await sendAll(normal([], "user_director"), deps);
    expect(rows.find((row) => row.recipient === "user_john")).toMatchObject({
      title: "Your normal services were changed",
      body: "You no longer have any normal services.",
    });
    expect(normal(["sunday_pm", "sunday_am"])).toEqual([]);
  });
});

describe("the one write path", () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

  it("is shared by the page's actions and the quick action, which write and announce nothing themselves", () => {
    const callers = [read("app/availability/actions.ts"), read("app/api/account/availability/route.ts")];
    for (const source of callers) {
      expect(source).toContain("@/lib/availability/change");
      expect(source).not.toMatch(/upsertExceptions|deleteExceptions|setNormalAvailability|applyChoice|notify/);
    }
    // And the shared path announces every kind of change.
    const change = read("lib/availability/change.ts");
    for (const builder of ["availabilityServiceChanged", "availabilityRangeChanged", "availabilityNormalChanged"]) expect(change).toContain(builder);
  });
});
