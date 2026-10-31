import { describe, expect, it } from "vitest";

import { regularOccurrences } from "@/lib/availability/occurrences";

import { notificationStore, TEAM } from "../__fixtures__/notifications";
import { notify } from "../service";
import { availabilityServiceChanged } from "./availability";
import { leaderUnavailableNotice, leadershipChangeNotices, type LeadershipServiceRef } from "./leadership";

const NOW = Date.parse("2026-11-01T12:00:00-07:00");
const DIRECTOR = "user_director";
const service: LeadershipServiceRef = { date: "2026-11-08", slot: "PM", startsAt: "2026-11-08T18:00:00-07:00", label: null, status: "draft" };
const roster = (leaders: Array<string | null>, ids = leaders.map((_, index) => `p${index + 1}`)) => ({
  defaultUserId: null,
  places: leaders.map((userId, index) => ({ id: ids[index], userId })),
});
const change = (before: ReturnType<typeof roster>, after: ReturnType<typeof roster>, extra: object = {}) => ({
  id: "change-1",
  cause: "assignment" as const,
  actor: DIRECTOR,
  before,
  after,
  ...extra,
});

describe("telling leaders about their part", () => {
  it("tells a newly assigned leader once, however many songs they were given", () => {
    const notices = leadershipChangeNotices({ change: change(roster([null, null, null]), roster(["user_mary", null, "user_mary"])), service, now: NOW });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      event: "song_leading.assigned",
      audience: { kind: "users", userIds: ["user_mary"] },
      title: "You're leading songs 1 and 3 at Sunday Evening",
      dedupeKey: "leadership:change-1:user_mary",
      entity: { type: "service_leading", id: "2026-11-08-pm" },
    });
    expect(notices[0].body).toContain("has not been published yet");
  });

  it("tells a former leader and a new leader different things", () => {
    const notices = leadershipChangeNotices({ change: change(roster(["user_mary"]), roster(["user_john"])), service, now: NOW });
    const byUser = new Map(notices.map((notice) => [(notice.audience as unknown as { userIds: string[] }).userIds[0], notice]));
    expect(byUser.get("user_mary")).toMatchObject({ event: "song_leading.removed", title: "You're no longer leading at Sunday Evening" });
    expect(byUser.get("user_john")).toMatchObject({ event: "song_leading.assigned" });
    expect(byUser.get("user_mary")!.body).not.toBe(byUser.get("user_john")!.body);
  });

  it("tells someone whose songs changed what they lead now and before", () => {
    const [notice] = leadershipChangeNotices({ change: change(roster(["user_mary", null]), roster([null, "user_mary"])), service: { ...service, status: "published" }, now: NOW });
    expect(notice.event).toBe("song_leading.changed");
    expect(notice.body).toContain("you now lead song 2 (before: song 1)");
    expect(notice.body).toContain("your songs are on your Dashboard");
  });

  it("says nothing for a save that changes no one's part, songs that only moved, or the actor's own part", () => {
    const same = roster(["user_mary", "user_john"], ["a", "b"]);
    const moved = roster(["user_john", "user_mary"], ["b", "a"]);
    expect(leadershipChangeNotices({ change: change(same, same), service, now: NOW })).toEqual([]);
    expect(leadershipChangeNotices({ change: change(same, moved), service, now: NOW })).toEqual([]);
    expect(leadershipChangeNotices({ change: change(roster([null]), roster([DIRECTOR])), service, now: NOW })).toEqual([]);
  });

  it("says nothing about a service already under way, or edits to a cancelled one", () => {
    expect(leadershipChangeNotices({ change: change(roster([null]), roster(["user_mary"])), service, now: Date.parse(service.startsAt) })).toEqual([]);
    expect(leadershipChangeNotices({ change: change(roster([null]), roster(["user_mary"])), service: { ...service, status: "cancelled" }, now: NOW })).toEqual([]);
  });

  it("tells a cancelled or restored service's leaders in their own words", () => {
    const both = roster(["user_mary", "user_john", "user_mary"]);
    const cancelled = leadershipChangeNotices({
      change: change(both, both, { cause: "status", status: { from: "published", to: "cancelled" } }),
      service: { ...service, status: "cancelled" },
      now: NOW,
    });
    expect(cancelled.map((notice) => notice.event)).toEqual(["song_leading.service_cancelled", "song_leading.service_cancelled"]);
    expect(cancelled.find((notice) => notice.dedupeKey?.endsWith("user_mary"))!.body).toContain("You were leading songs 1 and 3");
    const restored = leadershipChangeNotices({
      change: change(both, both, { cause: "status", status: { from: "cancelled", to: "draft" } }),
      service,
      now: NOW,
    });
    expect(restored.map((notice) => notice.event)).toEqual(["song_leading.service_restored", "song_leading.service_restored"]);
  });

  it("never names a song, a key or another leader", () => {
    const notices = leadershipChangeNotices({ change: change(roster(["user_john", null]), roster(["user_mary", "user_john"])), service, now: NOW });
    for (const notice of notices) {
      const text = JSON.stringify(notice);
      expect(text).not.toMatch(/title":"(?!You)/);
      const others = ["user_mary", "user_john"].filter((id) => !notice.dedupeKey!.endsWith(id));
      for (const other of others) expect(`${notice.title} ${notice.body}`).not.toContain(other);
    }
  });

  it("tells the schedulers - not the leader - when an assigned leader becomes unavailable", () => {
    const notice = leaderUnavailableNotice({ actorId: "user_mary", leader: { id: "user_mary", name: "Mary" }, service, positions: [2, 5], now: NOW })!;
    expect(notice).toMatchObject({
      event: "song_leading.leader_unavailable",
      audience: { kind: "permission", permission: "manage_service_plans" },
      title: "Mary is unavailable for Sunday Evening",
      actionUrl: "/service-planner/2026-11-08-pm",
    });
    expect(notice.except).toContain("user_mary");
    expect(leaderUnavailableNotice({ actorId: "x", leader: { id: "y", name: "Y" }, service, positions: [], now: NOW })).toBeNull();
  });
});

describe("telling the same change twice", () => {
  it("tells nobody twice: the second time records nothing, pushes nothing, emails nothing", async () => {
    const { deps, events, rows, sent, device, preferences, outbox } = notificationStore(TEAM);
    device("user_mary");
    preferences.push({ userId: "user_mary", category: "song_leading", channel: "email", enabled: true });
    const [notice] = leadershipChangeNotices({ change: change(roster([null]), roster(["user_mary"])), service, now: NOW });

    const first = await notify(notice, deps);
    const second = await notify(notice, deps);
    expect(first).toMatchObject({ ok: true, recipients: 1 });
    expect(second).toMatchObject({ ok: true, recipients: 0, duplicate: true });
    expect(events).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it("keeps folding separate: a different change to the same service still tells them, folded in the app", async () => {
    const { deps, rows } = notificationStore(TEAM);
    const [one] = leadershipChangeNotices({ change: change(roster([null, null]), roster(["user_mary", null])), service, now: NOW });
    const [two] = leadershipChangeNotices({
      change: { ...change(roster(["user_mary", null]), roster(["user_mary", "user_mary"])), id: "change-2" },
      service,
      now: NOW,
    });
    await notify(one, deps);
    await notify(two, deps);
    // One row in the bell (folded), two events recorded.
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe(two.title);
  });
});

describe("a leader who becomes unavailable", () => {
  it("is one notice for a director, not two: the leader notice folds into the availability notice", async () => {
    const { deps, rows } = notificationStore(TEAM);
    const [occurrence] = regularOccurrences("2026-11-08", "2026-11-08").filter((item) => item.slot === "PM");
    // Mary (a Song Leader) marks herself away; both directors manage availability and plan services.
    for (const input of availabilityServiceChanged({
      actorId: "user_mary",
      person: { id: "user_mary", name: "Mary" },
      normal: ["sunday_pm"],
      occurrence,
      exception: null,
      choice: "unavailable",
    })) {
      await notify(input, deps);
    }
    await notify(
      leaderUnavailableNotice({ actorId: "user_mary", leader: { id: "user_mary", name: "Mary" }, service, positions: [2, 5], now: NOW })!,
      deps,
    );
    for (const director of ["user_director", "user_assistant"]) {
      const mine = rows.filter((row) => row.recipient === director);
      expect(mine, director).toHaveLength(1);
      expect(mine[0].title).toBe("Mary is unavailable for Sunday Evening");
      expect(mine[0].body).toContain("songs 2 and 5");
    }
  });
});
