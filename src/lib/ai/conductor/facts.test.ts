import { describe, expect, it } from "vitest";

import {
  checkSongForService,
  findSongs,
  listServices,
  resolveSong,
  serviceName,
  SERVICES_LISTED,
  servicesOn,
  songFacts,
  songsNotSungSince,
  songUsage,
  songUses,
  upcomingServices,
  yearSummary,
  type ConductorData,
  type UpcomingService,
} from "@/lib/ai/conductor/facts";
import { CONDUCTOR_LIMITS } from "@/lib/ai/conductor/limits";
import { addDays } from "@/lib/availability/occurrences";
import { startsAtFor } from "@/lib/service-time";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

const song = (title: string, number: string | null, key: string | null = "G", insert = false): Song => ({
  title,
  number,
  key,
  ...(insert ? { insert: true } : {}),
});

const service = (date: string, slot: ServiceSlot, songs: Song[], label?: string): DatedService => ({
  date,
  slot,
  startsAt: startsAtFor(date, slot),
  songs,
  ...(label ? { label, kind: "special" as const } : {}),
});

const BLESSED = song("Blessed Assurance", "233", "D");
const AMAZING = song("Amazing Grace", "107");
const HOLY = song("Holy, Holy, Holy", "1", "Eb");
const PSALM = song("Psalm 23", null, "C", true);

// Monday, October 5, 2026, midday in Arizona.
const NOW = Date.parse("2026-10-05T12:00:00-07:00");

const PAST: DatedService[] = [
  service("2026-08-02", "AM", [HOLY, song("Blessed Assurance", "233", "C")]),
  service("2026-09-06", "AM", [BLESSED, AMAZING]),
  service("2026-09-20", "AM", [HOLY, PSALM, AMAZING]),
  service("2026-09-20", "PM", [song("Psalm 23", null, "C", true), BLESSED]),
  service("2026-09-23", "PM", [PSALM]),
  service("2026-10-04", "AM", [BLESSED, AMAZING, HOLY]),
];

const published: UpcomingService = { ...service("2026-10-11", "AM", [AMAZING, BLESSED]), status: "published", emptyPlaces: 0 };
const draft: UpcomingService = { ...service("2026-10-11", "PM", [HOLY]), status: "draft", emptyPlaces: 4 };

const data = (overrides: Partial<ConductorData> = {}): ConductorData => ({
  now: NOW,
  today: "2026-10-05",
  past: PAST,
  upcoming: [published],
  catalog: [{ title: "A New Song", number: null, collection: null, defaultKey: "F" }],
  draftsIncluded: false,
  historyAvailable: true,
  ...overrides,
});

describe("resolveSong", () => {
  it("finds a song by its title however it is punctuated, by part of it, or by number", () => {
    expect(resolveSong(data(), "holy holy holy").match?.title).toBe("Holy, Holy, Holy");
    expect(resolveSong(data(), "blessed").match?.title).toBe("Blessed Assurance");
    expect(resolveSong(data(), "#233").match?.title).toBe("Blessed Assurance");
    expect(resolveSong(data(), "blessed-assurance").match?.title).toBe("Blessed Assurance");
  });

  it("knows songs that are planned or in the catalog but never sung", () => {
    expect(resolveSong(data(), "A New Song").match).toMatchObject({ timesSung: 0, lastSung: null });
  });

  it("never chooses between several: it hands back the candidates", () => {
    const many = data({ past: [...PAST, service("2026-07-05", "AM", [song("Amazing Love", "200")])] });
    const { match, candidates } = resolveSong(many, "amazing");
    expect(match).toBeNull();
    expect(candidates.map((item) => item.title)).toEqual(["Amazing Grace", "Amazing Love"]);
    expect(songFacts(many, "amazing")).toMatchObject({ found: false, possibleSongs: [{ title: "Amazing Grace" }, { title: "Amazing Love" }] });
  });

  it("says so when nothing matches", () => {
    expect(resolveSong(data(), "Nonexistent Hymn")).toEqual({ match: null, candidates: [] });
    expect(songFacts(data(), "Nonexistent Hymn")).toMatchObject({ found: false });
    expect(findSongs(data(), "Nonexistent Hymn")).toEqual({ query: "Nonexistent Hymn", exactMatch: null, songs: [] });
  });
});

describe("songFacts", () => {
  const facts = songFacts(data(), "Blessed Assurance");

  it("gives the counts, dates and keys the song page gives", () => {
    expect(facts).toMatchObject({
      found: true,
      song: { title: "Blessed Assurance", number: "233" },
      timesSung: 4,
      firstSung: "2026-08-02",
      lastSung: "2026-10-04",
      daysSinceLastSung: 1,
      keysUsed: [
        { key: "D", times: 3 },
        { key: "C", times: 1 },
      ],
      recordsBegin: "2026-08-02",
    });
  });

  it("lists the latest times newest first, the whole last service, and where it is planned", () => {
    if (!facts.found) throw new Error("not found");
    expect(facts.recentTimesSung[0]).toEqual({ date: "2026-10-04", service: "Sunday morning", key: "D" });
    expect(facts.lastTimeItWasSung?.songs.map((item) => item.title)).toEqual(["Blessed Assurance", "Amazing Grace", "Holy, Holy, Holy"]);
    expect(facts.plannedFor).toEqual([{ date: "2026-10-11", service: "Sunday morning", status: "published", key: "D" }]);
  });
});

describe("songUses", () => {
  it("counts a period, both ends included", () => {
    expect(songUses(data(), "Blessed Assurance", "2026-09-01", "2026-09-30")).toMatchObject({
      timesSung: 2,
      dates: [
        { date: "2026-09-06", service: "Sunday morning" },
        { date: "2026-09-20", service: "Sunday evening" },
      ],
    });
    expect(songUses(data(), "Blessed Assurance", "2025-01-01", "2025-12-31")).toMatchObject({ timesSung: 0, dates: [] });
  });

  it("counts an insert by its weeks as well as its services", () => {
    expect(songUses(data(), "Psalm 23", "2026-09-01", "2026-09-30")).toMatchObject({ timesSung: 3, weeksSungIn: 1 });
  });
});

describe("servicesOn", () => {
  it("gives a past service's songs in order", () => {
    const result = servicesOn(data(), "2026-09-20", "AM");
    expect(result.services).toHaveLength(1);
    expect(result.services[0]).toMatchObject({ service: "Sunday morning", status: "sung" });
    expect(result.services[0].songs.map((item) => [item.place, item.title])).toEqual([
      [1, "Holy, Holy, Holy"],
      [2, "Psalm 23"],
      [3, "Amazing Grace"],
    ]);
  });

  it("gives both services of a day when no slot is asked for", () => {
    expect(servicesOn(data(), "2026-09-20").services.map((item) => item.slot)).toEqual(["AM", "PM"]);
  });

  it("says a coming service has not been posted, rather than nothing", () => {
    const result = servicesOn(data(), "2026-10-11");
    expect(result.services.map((item) => item.status)).toEqual(["published"]);
    expect(result.servicesWithNoSongs).toEqual([{ date: "2026-10-11", slot: "PM", service: "Sunday evening", status: "not posted yet" }]);
  });

  it("says when no service is held that day", () => {
    expect(servicesOn(data(), "2026-10-06")).toMatchObject({ services: [], note: "No service is recorded or planned on that date." });
  });
});

describe("drafts", () => {
  it("are withheld from someone who does not manage service plans", () => {
    // data.ts never loads them for such a person; nothing downstream can then reveal one.
    const result = upcomingServices(data(), { days: 7 });
    if (!result.found) throw new Error("not found");
    expect(JSON.stringify(result)).not.toContain("draft");
    expect(result.services.find((item) => item.date === "2026-10-11" && item.slot === "PM")).toMatchObject({ status: "not posted yet", songs: [] });
  });

  it("are shown, and named as drafts, to a planner", () => {
    const result = upcomingServices(data({ upcoming: [published, draft], draftsIncluded: true }), { days: 7 });
    if (!result.found) throw new Error("not found");
    expect(result.services.find((item) => item.date === "2026-10-11" && item.slot === "PM")).toMatchObject({
      status: "draft",
      placesNotFilledYet: 4,
    });
    expect(result.services.find((item) => item.date === "2026-10-07")).toMatchObject({ status: "not started" });
  });
});

describe("upcomingServices", () => {
  it("lists only the coming services a song is planned for, when asked", () => {
    const result = upcomingServices(data(), { days: 30, song: "Blessed Assurance" });
    if (!result.found) throw new Error("not found");
    expect(result.services.map((item) => item.date)).toEqual(["2026-10-11"]);
  });
});

describe("listServices", () => {
  it("filters by dates, kind of service and exact song", () => {
    const all = listServices(data(), { from: "2026-09-01", to: "2026-09-30" });
    if (!all.found) throw new Error("not found");
    expect(all.services.map((item) => `${item.date} ${item.slot}`)).toEqual(["2026-09-06 AM", "2026-09-20 AM", "2026-09-20 PM", "2026-09-23 PM"]);

    const wednesdays = listServices(data(), { from: "2026-09-01", to: "2026-09-30", type: "wednesday" });
    if (!wednesdays.found) throw new Error("not found");
    expect(wednesdays.services.map((item) => item.date)).toEqual(["2026-09-23"]);

    const withSong = listServices(data(), { from: "2026-08-01", to: "2026-10-31", song: "Holy, Holy, Holy" });
    if (!withSong.found) throw new Error("not found");
    expect(withSong.services.map((item) => item.date)).toEqual(["2026-08-02", "2026-09-20", "2026-10-04"]);
  });

  it("caps a long range at the latest services, and says so", () => {
    const many = Array.from({ length: 40 }, (_, index) => service(addDays("2025-10-05", index * 7), "AM", [AMAZING]));
    const result = listServices(data({ past: many }), { from: "2025-01-01", to: "2026-09-30" });
    if (!result.found) throw new Error("not found");
    expect(result.services).toHaveLength(SERVICES_LISTED);
    expect(result).toMatchObject({ truncated: true, servicesMatching: 40 });
    expect(result.services.at(-1)?.date).toBe(many.at(-1)?.date);
  });
});

describe("songUsage and songsNotSungSince", () => {
  it("ranks a period by use, counting an insert's week once", () => {
    const most = songUsage(data(), { from: "2026-08-01", to: "2026-10-31" });
    expect(most.songs.slice(0, 2).map((item) => [item.title, item.timesUsed])).toEqual([
      ["Blessed Assurance", 4],
      ["Holy, Holy, Holy", 3],
    ]);
    expect(most.songs.find((item) => item.title === "Psalm 23")).toMatchObject({ timesUsed: 1, timesSung: 3 });
    expect(songUsage(data(), { from: "2026-08-01", to: "2026-10-31", order: "least", limit: 1 }).songs[0].title).toBe("Psalm 23");
  });

  it("caps the list and says so", () => {
    const result = songUsage(data(), { from: "2026-08-01", to: "2026-10-31", limit: 2 });
    expect(result.songs).toHaveLength(2);
    expect(result).toMatchObject({ truncated: true, differentSongsInPeriod: 4 });
  });

  it("finds songs gone quiet, leaving out anything already planned", () => {
    const old = service("2026-03-01", "AM", [song("Rock of Ages", "150"), AMAZING]);
    const older = service("2026-02-01", "AM", [song("Rock of Ages", "150")]);
    const result = songsNotSungSince(data({ past: [older, old, ...PAST] }), { days: 60 });
    expect(result.songs.map((item) => item.title)).toEqual(["Rock of Ages"]);
    expect(result.songs[0]).toMatchObject({ timesSung: 2, lastSung: "2026-03-01" });
    // Everything in the base data was sung within the last 60 days or is planned.
    expect(songsNotSungSince(data(), { days: 10 }).songs.map((item) => item.title)).toEqual(["Psalm 23"]);
  });
});

describe("checkSongForService", () => {
  it("says when a song would be repeated within the planner's window", () => {
    const result = checkSongForService(data(), "Blessed Assurance", "2026-10-07", "PM");
    expect(result).toMatchObject({
      found: true,
      lastSungBeforeIt: "2026-10-04",
      daysBetween: 3,
      sungWithinRecentWindow: true,
      plannedNearby: true,
      alsoPlannedFor: [{ date: "2026-10-11", service: "Sunday morning", status: "published", withinRecentWindow: true }],
    });
  });

  it("does not count the service itself as another place it is planned", () => {
    expect(checkSongForService(data(), "Blessed Assurance", "2026-10-11", "AM")).toMatchObject({ alsoPlannedFor: [], plannedNearby: false });
  });

  it("is clear when a song is far enough back", () => {
    expect(checkSongForService(data(), "Psalm 23", "2026-11-01", "AM")).toMatchObject({ sungWithinRecentWindow: false, daysBetween: 38 });
  });
});

describe("yearSummary", () => {
  it("sums a year up, and says which years exist when one is empty", () => {
    expect(yearSummary(data(), 2026)).toMatchObject({ found: true, services: 6, differentSongs: 4, partialYear: "still under way" });
    expect(yearSummary(data(), 2019)).toEqual({ found: false, note: "Nothing is recorded for 2019.", yearsWithRecords: [2026] });
  });
});

describe("the size of what a tool returns", () => {
  it("stays small even over a long history", () => {
    const titles = Array.from({ length: 60 }, (_, index) => song(`Hymn Number ${index + 1}`, String(index + 1)));
    const long = Array.from({ length: 300 }, (_, index) =>
      service(addDays("2021-01-03", index * 7), "AM", [titles[index % 60], titles[(index * 7) % 60], titles[(index * 11) % 60], BLESSED]),
    );
    const big = data({ past: long });
    for (const result of [
      songFacts(big, "Blessed Assurance"),
      songUses(big, "Blessed Assurance", "2021-01-01", "2026-12-31"),
      listServices(big, { from: "2021-01-01", to: "2026-09-30" }),
      songUsage(big, { from: "2021-01-01", to: "2026-12-31", limit: 25 }),
      songsNotSungSince(big, { days: 1, limit: 25 }),
      yearSummary(big, 2024),
    ]) {
      expect(JSON.stringify(result).length).toBeLessThan(CONDUCTOR_LIMITS.toolResultChars);
    }
  });
});

describe("dates", () => {
  it("are the church's, even when the archive hands an instant back in UTC", () => {
    // Wednesday evening in Arizona is already Thursday in UTC.
    const wednesday: DatedService = {
      date: "2026-09-30",
      slot: "PM",
      startsAt: new Date(startsAtFor("2026-09-30", "PM")).toISOString(),
      songs: [song("Rock of Ages", "150")],
    };
    expect(wednesday.startsAt.slice(0, 10)).toBe("2026-10-01");
    const stored = data({ past: [...PAST, wednesday] });
    expect(songFacts(stored, "Rock of Ages")).toMatchObject({ firstSung: "2026-09-30", lastSung: "2026-09-30" });
    expect(findSongs(stored, "Rock of Ages").exactMatch?.lastSung).toBe("2026-09-30");
    expect(songUsage(stored, { from: "2026-09-30", to: "2026-09-30" }).songs[0].lastSung).toBe("2026-09-30");
    expect(checkSongForService(stored, "Rock of Ages", "2026-10-04", "AM")).toMatchObject({ lastSungBeforeIt: "2026-09-30" });
  });
});

describe("serviceName", () => {
  it("names a service the way people do", () => {
    expect(serviceName({ date: "2026-10-04", slot: "PM" })).toBe("Sunday evening");
    expect(serviceName({ date: "2026-10-07", slot: "PM" })).toBe("Wednesday evening");
    expect(serviceName({ date: "2026-10-09", slot: "PM", label: "Missions Conference" })).toBe("Missions Conference (Friday evening)");
  });
});
