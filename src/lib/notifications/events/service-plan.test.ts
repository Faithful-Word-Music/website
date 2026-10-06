import { describe, expect, it } from "vitest";

import { diffSlots, planSong, type PlanSlots } from "@/lib/service-planner/model";

import { TEAM, actor, notificationStore } from "../__fixtures__/notifications";
import { listNotifications, markRead, notify, setPreference, type NotifyInput } from "../service";
import {
  preparationChanges,
  servicePlanPublished,
  servicePlanSaved,
  servicePlanStatusChanged,
  servicePlansWithdrawnByInsert,
  type ServiceRef,
} from "./service-plan";

const NOW = Date.parse("2026-10-06T12:00:00-07:00");
const DIRECTOR = "user_director";

const sundayAm: ServiceRef = { date: "2026-10-11", slot: "AM", startsAt: "2026-10-11T10:30:00-07:00", label: null };
const sundayPm: ServiceRef = { date: "2026-10-11", slot: "PM", startsAt: "2026-10-11T18:00:00-07:00", label: null };
const wednesday: ServiceRef = { date: "2026-10-14", slot: "PM", startsAt: "2026-10-14T19:00:00-07:00", label: null };
const lastSunday: ServiceRef = { date: "2026-10-04", slot: "AM", startsAt: "2026-10-04T10:30:00-07:00", label: null };

const song = (title: string, number: string | null, key: string | null = null) => planSong({ title, number, key });
const PLAN: PlanSlots = [song("Amazing Grace", "247", "G"), song("Holy, Holy, Holy", "3", "D"), song("Psalm 120", null, "Em")];

/** A save of a service that was already published. */
const edited = (after: PlanSlots, before: PlanSlots = PLAN, service: ServiceRef = sundayAm) =>
  servicePlanSaved({
    actorId: DIRECTOR,
    statusBefore: "published",
    startsAtBefore: service.startsAt,
    publicationId: null,
    service,
    changes: diffSlots(before, after),
    now: NOW,
  });

const john = actor("user_john");
const recipientsOf = (rows: Array<{ recipient: string }>) => rows.map((row) => row.recipient).sort();

async function send(input: NotifyInput | null, deps: ReturnType<typeof notificationStore>["deps"]) {
  expect(input).not.toBeNull();
  return notify(input!, deps);
}

describe("publishing", () => {
  it("makes one event for one service, for the people who prepare from the song list", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await send(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [sundayAm], now: NOW }), deps);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventKey: "service_plan.published", category: "service_plan_published", entityType: "service_publication", entityId: "pub-1", priority: "normal" });
    // Not the administrator (who holds everything, but is not on the team), and not the publisher.
    expect(recipientsOf(rows)).toEqual(["user_assistant", "user_john", "user_mary"]);
    expect(rows[0]).toMatchObject({ title: "Sunday Morning song list published", actionUrl: "/song-list#2026-10-11-am" });
    expect(rows[0].body).toBe("The song list for Sunday Morning, Sunday, October 11, has been published.");
  });

  it("makes ONE event for several services published together", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await send(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-2", services: [sundayAm, sundayPm, wednesday], now: NOW }), deps);

    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ services: [{ anchor: "2026-10-11-am" }, { anchor: "2026-10-11-pm" }, { anchor: "2026-10-14-pm" }] });
    expect(rows.filter((row) => row.recipient === "user_john")).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "New song lists published",
      body: "The song lists for Sunday Morning, Sunday Evening and Wednesday Evening have been published.",
      actionUrl: "/song-list",
    });
  });

  it("counts the services when there are too many to name", () => {
    const fourth: ServiceRef = { date: "2026-10-18", slot: "AM", startsAt: "2026-10-18T10:30:00-07:00", label: null };
    const input = servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-3", services: [sundayAm, sundayPm, wednesday, fourth], now: NOW });
    expect(input?.body).toBe("4 song lists have been published.");
  });

  it("does not tell the person who published", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await send(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [sundayAm], now: NOW }), deps);
    expect(rows.some((row) => row.recipient === DIRECTOR)).toBe(false);
  });

  it("says nothing of a service already held", () => {
    expect(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [lastSunday], now: NOW })).toBeNull();
    expect(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [], now: NOW })).toBeNull();
  });

  it("publishes from the service's own page as the same event", () => {
    const input = servicePlanSaved({
      actorId: DIRECTOR,
      statusBefore: "draft",
      startsAtBefore: sundayAm.startsAt,
      publicationId: "pub-9",
      service: sundayAm,
      changes: diffSlots([], PLAN),
      now: NOW,
    });
    expect(input).toMatchObject({ event: "service_plan.published", entity: { type: "service_publication", id: "pub-9" } });
  });

  it("respects someone who turned the category off", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await setPreference(john, { category: "service_plan_published", channel: "in_app", enabled: false }, deps);
    await send(servicePlanPublished({ actorId: DIRECTOR, publicationId: "pub-1", services: [sundayAm], now: NOW }), deps);
    expect(recipientsOf(rows)).toEqual(["user_assistant", "user_mary"]);
  });
});

describe("saving", () => {
  it("says nothing of a draft, however much was edited", () => {
    for (const statusBefore of ["draft", null] as const) {
      const input = servicePlanSaved({
        actorId: DIRECTOR,
        statusBefore,
        startsAtBefore: sundayAm.startsAt,
        publicationId: null,
        service: sundayAm,
        changes: diffSlots([], PLAN),
        now: NOW,
      });
      expect(input).toBeNull();
    }
  });

  it("says nothing when a published plan's songs were only put in a different order, or nothing changed", () => {
    const reordered: PlanSlots = [PLAN[1], PLAN[0], PLAN[2]];
    expect(diffSlots(PLAN, reordered).length).toBeGreaterThan(0);
    expect(preparationChanges(diffSlots(PLAN, reordered))).toEqual([]);
    expect(edited(reordered)).toBeNull();
    expect(edited(PLAN)).toBeNull();
  });

  it("tells people when a song is added to a published plan", () => {
    const input = edited([...PLAN, song("Be Thou My Vision", "382", "Eb")]);
    expect(input).toMatchObject({
      event: "service_plan.updated",
      title: "Sunday Morning song list updated",
      body: "Sunday, October 11: Be Thou My Vision was added.",
      entity: { type: "service", id: "2026-10-11-am" },
      except: [DIRECTOR],
    });
  });

  it("tells people when a song is removed or replaced", () => {
    expect(edited([PLAN[0], PLAN[1], null])?.body).toBe("Sunday, October 11: Psalm 120 was removed.");
    expect(edited([PLAN[0], song("Be Thou My Vision", "382", "Eb"), PLAN[2]])?.body).toBe(
      "Sunday, October 11: Holy, Holy, Holy was replaced with Be Thou My Vision.",
    );
  });

  it("tells people when a key changes", () => {
    expect(edited([song("Amazing Grace", "247", "F"), PLAN[1], PLAN[2]])?.body).toBe("Sunday, October 11: Amazing Grace is now in F.");
  });

  it("tells people when the service's time moves, and sums up several changes at once", () => {
    const moved = servicePlanSaved({
      actorId: DIRECTOR,
      statusBefore: "published",
      startsAtBefore: "2026-10-11T10:30:00-07:00",
      publicationId: null,
      service: { ...sundayAm, startsAt: "2026-10-11T11:00:00-07:00" },
      changes: [],
      now: NOW,
    });
    expect(moved?.body).toBe("Sunday, October 11: The service now starts at 11:00 AM.");
    expect(edited([song("Amazing Grace", "247", "F"), null, PLAN[2]])?.body).toBe(
      "Sunday, October 11: Several changes were made to the published song list.",
    );
  });

  it("says nothing of a published service already held", () => {
    expect(edited([PLAN[0], PLAN[1], null], PLAN, lastSunday)).toBeNull();
  });

  it("folds several quick edits to one service into one notification, keeping every event", async () => {
    const { deps, events, rows, advance } = notificationStore(TEAM);
    await send(edited([song("Amazing Grace", "247", "F"), PLAN[1], PLAN[2]]), deps);
    advance(2);
    await send(edited([PLAN[0], PLAN[1], null]), deps);
    advance(2);
    await send(edited([...PLAN, song("Be Thou My Vision", "382", "Eb")]), deps);

    expect(events).toHaveLength(3);
    const mine = await listNotifications(john, {}, deps);
    expect(mine.unread).toBe(1);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({
      title: "Sunday Morning song list updated",
      body: "Sunday, October 11: Several changes were made to the published song list.",
    });
    // Another service's edit is its own notification.
    await send(edited([PLAN[0], PLAN[1], null], PLAN, sundayPm), deps);
    expect((await listNotifications(john, {}, deps)).unread).toBe(2);
    expect(rows.filter((row) => row.recipient === "user_mary")).toHaveLength(2);
  });

  it("makes a new notification for a later edit once the first was read, or once it is old", async () => {
    const { deps, advance } = notificationStore(TEAM);
    await send(edited([song("Amazing Grace", "247", "F"), PLAN[1], PLAN[2]]), deps);
    const [first] = (await listNotifications(john, {}, deps)).items;
    await markRead(john, { id: first.id, read: true }, deps);

    await send(edited([PLAN[0], PLAN[1], null]), deps);
    let mine = await listNotifications(john, {}, deps);
    expect(mine.items).toHaveLength(2);
    expect(mine.unread).toBe(1);
    // What he read is as he read it; the new one says what this change was.
    expect(mine.items[1]).toMatchObject({ id: first.id, body: "Sunday, October 11: Amazing Grace is now in F." });
    expect(mine.items[0].body).toBe("Sunday, October 11: Psalm 120 was removed.");

    advance(60);
    await send(edited([...PLAN, song("Be Thou My Vision", "382", "Eb")]), deps);
    mine = await listNotifications(john, {}, deps);
    expect(mine.items).toHaveLength(3);
    expect(mine.unread).toBe(2);
  });
});

describe("status", () => {
  const changed = (before: "draft" | "published" | "cancelled" | null, after: "draft" | "published" | "cancelled", service = sundayPm) =>
    servicePlanStatusChanged({ actorId: DIRECTOR, before, after, service, now: NOW });

  it("tells people when a published service is returned to draft", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await send(changed("published", "draft"), deps);
    expect(rows[0]).toMatchObject({
      title: "Sunday Evening song list is being revised",
      body: "The published song list for Sunday, October 11 has been returned to draft.",
      priority: "important",
      category: "service_plan_updated",
    });
    expect(recipientsOf(rows)).toEqual(["user_assistant", "user_john", "user_mary"]);
  });

  it("shows only the withdrawal when a service is edited and then returned to draft", async () => {
    const { deps } = notificationStore(TEAM);
    await send(edited([PLAN[0], PLAN[1], null], PLAN, sundayPm), deps);
    await send(changed("published", "draft"), deps);
    const mine = await listNotifications(john, {}, deps);
    expect(mine.items.map((item) => item.title)).toEqual(["Sunday Evening song list is being revised"]);
  });

  it("tells everyone on the team when an upcoming service is cancelled, as important", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    for (const before of ["draft", "published", null] as const) expect(changed(before, "cancelled")?.event).toBe("service_plan.cancelled");
    await send(changed("published", "cancelled"), deps);
    expect(events[0]).toMatchObject({ eventKey: "service_plan.cancelled", entityType: "service", entityId: "2026-10-11-pm", priority: "important" });
    expect(rows[0]).toMatchObject({ title: "Sunday Evening cancelled", body: "The Sunday Evening service on Sunday, October 11 has been cancelled." });
    expect(recipientsOf(rows)).toEqual(["user_assistant", "user_john", "user_mary"]);
  });

  it("tells them when a cancelled service is restored, without saying its songs are published", async () => {
    const { deps, rows } = notificationStore(TEAM);
    await send(changed("cancelled", "draft"), deps);
    expect(rows[0]).toMatchObject({ title: "Sunday Evening restored", priority: "important" });
    expect(rows[0].body).toBe("The Sunday Evening service on Sunday, October 11 has been restored. Its song list has not been published yet.");
  });

  it("says nothing when nothing changed, or the service is over", () => {
    expect(changed("draft", "draft")).toBeNull();
    expect(changed(null, "draft")).toBeNull();
    expect(changed("cancelled", "cancelled")).toBeNull();
    expect(changed("published", "draft", lastSunday)).toBeNull();
    expect(changed("published", "cancelled", lastSunday)).toBeNull();
  });
});

describe("the week's insert", () => {
  const byInsert = (services: ServiceRef[]) => servicePlansWithdrawnByInsert({ actorId: DIRECTOR, weekStart: "2026-10-11", services, now: NOW });

  it("says nothing when only drafts were brought up to date", () => {
    expect(byInsert([])).toBeNull();
  });

  it("makes one notification for all the published services it returned to draft", async () => {
    const { deps, events, rows } = notificationStore(TEAM);
    await send(byInsert([sundayAm, sundayPm]), deps);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventKey: "service_plan.withdrawn", entityType: "service_week", entityId: "2026-10-11", priority: "important" });
    expect(rows.filter((row) => row.recipient === "user_john")).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Published song lists are being revised",
      body: "2 upcoming song lists were returned to draft after this week's insert changed.",
    });
  });

  it("names the service when there is only one", () => {
    expect(byInsert([wednesday])).toMatchObject({
      title: "Wednesday Evening song list is being revised",
      body: "The published song list for Wednesday, October 14 was returned to draft after this week's insert changed.",
      entity: { type: "service", id: "2026-10-14-pm" },
    });
  });
});
