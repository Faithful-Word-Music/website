import { describe, expect, it } from "vitest";

import { startsAtFor } from "@/lib/service-time";
import { buildSongStats, TIMELINE_MONTHS } from "@/lib/song-stats";
import { songKey } from "@/lib/song-list";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

/** A service from "YYYY-MM-DD", its slot, and songs written "title key". */
function service(date: string, slot: ServiceSlot, songs: Array<[string, string | null]>): DatedService {
  return {
    date,
    slot,
    startsAt: startsAtFor(date, slot),
    songs: songs.map(([title, key]): Song => ({ number: null, title, key })),
  };
}

const river = songKey("Like a River Glorious");
const at = (date: string) => Date.parse(`${date}T12:00:00-07:00`);

const history: DatedService[] = [
  service("2025-10-05", "AM", [["Like a River Glorious", "F"], ["Amazing Grace", "G"], ["It Is Well", "C"]]),
  service("2025-11-02", "PM", [["Like a River Glorious", "F"], ["Amazing Grace", "G"]]),
  service("2025-12-07", "AM", [["Amazing Grace", "G"], ["Like a River Glorious", "E"], ["It Is Well", "C"]]),
  service("2026-01-04", "AM", [["Like a River Glorious", "F"], ["It Is Well", "C"], ["Amazing Grace", "Ab"]]),
  service("2026-02-01", "PM", [["Amazing Grace", "G"]]),
];

describe("buildSongStats", () => {
  const stats = buildSongStats(history, river, [], at("2026-02-10"));

  it("counts the times sung and the services", () => {
    expect(stats.count).toBe(4);
    expect(stats.services).toBe(4);
    expect(stats.servicesTotal).toBe(5);
    expect(stats.first).toBe(history[0].startsAt);
    expect(stats.last).toBe(history[3].startsAt);
    expect(stats.weekly).toMatchObject({ sundayMorning: 3, sundayEvening: 1, wednesday: 0, other: 0 });
  });

  it("ranks among every song, noting ties", () => {
    expect(stats.rank).toEqual({ position: 2, of: 3, joint: false });
    const grace = buildSongStats(history, songKey("Amazing Grace"), [], at("2026-02-10"));
    expect(grace.rank).toEqual({ position: 1, of: 3, joint: false });
    const both = [...history, service("2026-02-08", "AM", [["Like a River Glorious", "F"]])];
    expect(buildSongStats(both, river, [], at("2026-02-10")).rank).toEqual({ position: 1, of: 3, joint: true });
  });

  it("gives no rank to a song sung once", () => {
    const once = [service("2026-03-01", "AM", [["Psalm 23", null], ["It Is Well", "C"]])];
    expect(buildSongStats(once, songKey("Psalm 23"), [], at("2026-03-02")).rank).toBeNull();
  });

  it("lists keys by use", () => {
    expect(stats.keys).toEqual([
      { key: "F", count: 3 },
      { key: "E", count: 1 },
    ]);
  });

  it("finds the opener habit, ignoring one-song services", () => {
    expect(stats.placement).toMatchObject({ opener: 3, middle: 1, closer: 0, habit: "opener" });
    const grace = buildSongStats(history, songKey("Amazing Grace"), [], at("2026-02-10"));
    // Middle, closer, opener, closer; the one-song service in February is none of them.
    expect(grace.placement).toMatchObject({ opener: 1, middle: 1, closer: 2, habit: null });
  });

  it("counts a song sung twice in a service in both places", () => {
    const twice = [service("2026-03-01", "AM", [["Doxology", null], ["It Is Well", "C"], ["Doxology", null]])];
    const doxology = buildSongStats(twice, songKey("Doxology"), [], at("2026-03-02"));
    expect(doxology.count).toBe(2);
    expect(doxology.services).toBe(1);
    expect(doxology.placement).toMatchObject({ opener: 1, closer: 1, habit: null });
  });

  it("needs two times sung before calling a place a habit", () => {
    const one = buildSongStats([history[0]], river, [], at("2025-10-06"));
    expect(one.placement).toMatchObject({ opener: 1, habit: null });
  });
});

describe("weekly", () => {
  it("spots a song sung at all three services each time it comes round", () => {
    // Sunday morning and evening, then the Wednesday after; and later Wednesday, then Sunday.
    const insert = ["2026-01-04|AM", "2026-01-04|PM", "2026-01-07|PM", "2026-05-06|PM", "2026-05-10|AM", "2026-05-10|PM"].map(
      (entry) => {
        const [date, slot] = entry.split("|");
        return service(date, slot as ServiceSlot, [["Psalm 54", "Cm"]]);
      },
    );
    expect(buildSongStats(insert, songKey("Psalm 54"), [], at("2026-06-01")).weekly).toEqual({
      sundayMorning: 2,
      sundayEvening: 2,
      wednesday: 2,
      other: 0,
      visits: 2,
      fullWeeks: 2,
      habit: "all",
    });
  });

  it("names the usual service otherwise", () => {
    expect(buildSongStats(history, river, [], at("2026-02-10")).weekly).toMatchObject({
      visits: 4,
      fullWeeks: 0,
      habit: "sundayMorning",
    });
  });

  it("counts special meetings apart", () => {
    // 2026-03-05 is a Thursday.
    const special = [service("2026-03-05", "AM", [["A", null]]), service("2026-03-08", "AM", [["A", null]])];
    expect(buildSongStats(special, songKey("A"), [], at("2026-03-09")).weekly).toMatchObject({
      sundayMorning: 1,
      other: 1,
      visits: 1,
      habit: null,
    });
  });
});

describe("rhythm", () => {
  it("waits for three different days", () => {
    const sameDay = [
      service("2026-03-01", "AM", [["A", null]]),
      service("2026-03-01", "PM", [["A", null]]),
      service("2026-04-05", "AM", [["A", null]]),
    ];
    expect(buildSongStats(sameDay, songKey("A"), [], at("2026-04-06")).rhythm).toBeNull();
  });

  it("uses the median gap", () => {
    const stats = buildSongStats(history.slice(0, 4), river, [], at("2026-01-10"));
    expect(stats.rhythm).toMatchObject({ medianDays: 28, longestDays: 35 });
    // Gaps of 28, 28 and 70 days: the median ignores the one long wait.
    const uneven = [
      service("2026-01-04", "AM", [["A", null]]),
      service("2026-02-01", "AM", [["A", null]]),
      service("2026-03-01", "AM", [["A", null]]),
      service("2026-05-10", "AM", [["A", null]]),
    ];
    expect(buildSongStats(uneven, songKey("A"), [], at("2026-05-11")).rhythm).toMatchObject({
      medianDays: 28,
      longestDays: 70,
      sinceDays: 1,
    });
  });

  it("measures from stint to stint, not within one", () => {
    // A psalm sung three weeks running each season: every ~4 months, not every week.
    const psalm = ["2026-01-04", "2026-01-11", "2026-01-18", "2026-05-03", "2026-05-10", "2026-09-06", "2026-09-13"].map(
      (date) => service(date, "AM", [["Psalm 54", "Cm"]]),
    );
    expect(buildSongStats(psalm, songKey("Psalm 54"), [], at("2026-09-18")).rhythm).toMatchObject({
      medianDays: 122.5,
      longestDays: 119,
      sinceDays: 5,
      status: "recent",
    });
    expect(buildSongStats(psalm.slice(0, 5), songKey("Psalm 54"), [], at("2026-05-11")).rhythm).toBeNull();
  });

  it("says when it is due, recent, or already scheduled", () => {
    const three = [
      service("2026-01-04", "AM", [["A", null]]),
      service("2026-02-01", "AM", [["A", null]]),
      service("2026-03-01", "AM", [["A", null]]),
    ];
    const status = (date: string, upcoming: string[] = []) =>
      buildSongStats(three, songKey("A"), upcoming, at(date)).rhythm?.status;

    expect(status("2026-03-10")).toBe("recent"); // 9 days, under half of 28
    expect(status("2026-03-20")).toBeNull(); // 19 days
    expect(status("2026-04-12")).toBeNull(); // 42 days is exactly 1.5x, not over it
    expect(status("2026-04-13")).toBe("due");
    expect(status("2026-04-13", [startsAtFor("2026-05-03", "AM")])).toBe("scheduled");
  });
});

describe("timeline", () => {
  it("runs from when records began to the last upcoming service", () => {
    const stats = buildSongStats(history, river, [startsAtFor("2026-04-05", "AM")], at("2026-02-10"));
    expect(stats.timeline.map((cell) => `${cell.year}-${cell.month + 1}`)).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-1", "2026-2", "2026-3", "2026-4",
    ]);
    expect(stats.timeline.map((cell) => cell.sung)).toEqual([1, 1, 1, 1, 0, 0, 0]);
    expect(stats.timeline[6].upcoming).toBe(1);
    expect(stats.timelineClipped).toBe(false);
  });

  it("keeps to the most recent months", () => {
    const stats = buildSongStats(history, river, [], at("2028-06-01"));
    expect(stats.timeline).toHaveLength(TIMELINE_MONTHS);
    expect(stats.timelineClipped).toBe(true);
    expect(stats.timeline.at(-1)).toMatchObject({ year: 2028, month: 5 });
  });

  it("gives a song only scheduled so far a page of its own", () => {
    const stats = buildSongStats(history, songKey("New Song"), [startsAtFor("2026-03-01", "PM")], at("2026-02-10"));
    expect(stats).toMatchObject({ count: 0, first: null, rank: null, rhythm: null, keys: [] });
    expect(stats.timeline.reduce((sum, cell) => sum + cell.upcoming, 0)).toBe(1);
  });
});
