import { describe, expect, it } from "vitest";

import missions from "@/lib/__fixtures__/missions-conference-2025.json";
import october from "@/lib/__fixtures__/october-2026-partial.json";
import september from "@/lib/__fixtures__/september-2026.json";
import { getTimeline } from "@/lib/service-time";
import {
  datedServices,
  filterServices,
  keyMatches,
  listKeys,
  openingMonthIndex,
  parseMonthGrid,
  planMonth,
  serviceSlots,
  songKey,
  songSlug,
} from "@/lib/song-list";

describe("parseMonthGrid on the real September 2026 tab", () => {
  const month = parseMonthGrid("September", september as string[][]);

  it("finds every service, left block then right block, in date order", () => {
    expect(month.fallbackRows).toBeNull();
    expect(month.services).toHaveLength(13);
    const starts = month.services.map((service) => Date.parse(service.startsAt ?? ""));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("reads the AM/PM marker as the service, not as a song", () => {
    const first = month.services[0];
    expect(first.dateLabel).toBe("Wednesday, September 2, 2026");
    expect(first.slot).toBe("PM");
    expect(first.serviceLabel).toBe("Evening Service");
    expect(first.date).toBe("2026-09-02");
    expect(first.startsAt).toBe("2026-09-02T19:00:00-07:00");

    const allSongs = month.services.flatMap((service) => service.songs);
    expect(allSongs.some((song) => song.number === "AM" || song.number === "PM")).toBe(false);
    expect(allSongs.some((song) => /\d{4}/.test(song.title))).toBe(false);
  });

  it("gives Sunday morning and evening their own times", () => {
    const sundays = month.services.filter((service) => service.date === "2026-09-06");
    expect(sundays.map((service) => service.startsAt)).toEqual([
      "2026-09-06T10:30:00-07:00",
      "2026-09-06T18:00:00-07:00",
    ]);
    expect(sundays.map((service) => service.serviceLabel)).toEqual([
      "Morning Service",
      "Evening Service",
    ]);
  });

  it("keeps songs without a hymnal number and trims keys", () => {
    const first = month.services[0];
    expect(first.songs).toHaveLength(5);
    expect(first.songs[2]).toEqual({ number: null, title: "This World is Not My Home", key: "F" });
    const resolved = month.services.find((service) => service.date === "2026-09-06" && service.slot === "PM");
    expect(resolved?.songs[0]).toEqual({ number: "288", title: "I Am Resolved", key: "Ab" });
  });

  it("has no unfilled slots - the footnote row is not one", () => {
    expect(month.services.map((service) => service.pendingSongs)).toEqual(
      month.services.map(() => 0),
    );
  });

  it("reads the heading", () => {
    expect(month.heading).toBe("September Song List");
  });
});

describe("parseMonthGrid on the Missions Conference tab", () => {
  const month = parseMonthGrid("Missions Conference", missions as string[][]);

  it("handles weekday services and a two-line heading", () => {
    expect(month.heading).toBe("Missions Conference Song List");
    const first = month.services[0];
    expect(first.date).toBe("2025-11-06");
    expect(first.startsAt).toBe("2025-11-06T19:00:00-07:00");
    const fridayMorning = month.services.find((service) => service.date === "2025-11-07" && service.slot === "AM");
    expect(fridayMorning?.startsAt).toBe("2025-11-07T10:30:00-07:00");
  });
});

describe("parseMonthGrid fallbacks", () => {
  it("labels an unmarked repeated date Morning then Evening", () => {
    const grid = [
      ["June Song List"],
      ["", "Sunday, June 7, 2026"],
      ["1", "A", "C"],
      [],
      ["", "Sunday, June 7, 2026"],
      ["2", "B", "D"],
    ];
    const { services } = parseMonthGrid("June", grid);
    expect(services.map((service) => [service.serviceLabel, service.startsAt])).toEqual([
      ["Morning Service", "2026-06-07T10:30:00-07:00"],
      ["Evening Service", "2026-06-07T18:00:00-07:00"],
    ]);
  });

  it("splits a date marked AM twice into Morning then Evening, keeping both", () => {
    const grid = [
      ["January Song List"],
      ["AM", "Sunday, January 18, 2026"],
      ["1", "Morning Song", "C"],
      [],
      ["AM", "Sunday, January 18, 2026"],
      ["2", "Evening Song", "D"],
    ];
    const { services } = parseMonthGrid("January", grid);
    expect(services.map((service) => [service.slot, service.songs[0].title])).toEqual([
      ["AM", "Morning Song"],
      ["PM", "Evening Song"],
    ]);
  });

  it("reads TBD and #N/A as unfilled slots, never as songs", () => {
    // The real shape of the March 2026 tab: a service planned but never filled in.
    const grid = [
      ["March Song List"],
      ["PM", "Wednesday, March 11, 2026"],
      ["TBD", "#N/A", "#N/A"],
      ["", "TBD", "#N/A"],
      ["44", "We'll Work Till Jesus Comes", "#N/A"],
      ["TBD", "Real Song With No Number Yet", "F"],
    ];
    const [service] = parseMonthGrid("March", grid).services;
    expect(service.pendingSongs).toBe(2);
    expect(service.songs).toEqual([
      { number: "44", title: "We'll Work Till Jesus Comes", key: null },
      { number: null, title: "Real Song With No Number Yet", key: "F" },
    ]);
  });

  it("keeps a service whose slots are all TBD, but leaves it out of history", () => {
    const grid = [["March Song List"], ["PM", "Wednesday, March 11, 2026"], ["TBD", "#N/A", "#N/A"]];
    const month = parseMonthGrid("March", grid);
    expect(month.services).toHaveLength(1);
    expect(month.services[0].pendingSongs).toBe(1);
    expect(datedServices([month])).toEqual([]);
  });

  it("falls back to raw rows when nothing parses", () => {
    const month = parseMonthGrid("Odd", [["Heading"], ["just", "", ""]]);
    expect(month.services).toHaveLength(0);
    expect(month.fallbackRows).not.toBeNull();
  });
});

// The real October tab mid-planning (26 Sep 2026): the first three services
// are this year's, with most songs still #N/A; the rest are last year's rows.
describe("two visible months, the second still being planned", () => {
  const now = Date.parse("2026-09-26T22:41:00-07:00");
  const sep = parseMonthGrid("September", september as string[][]);
  const oct = parseMonthGrid("October", october as string[][]);

  it("gives the two tabs different service ids, though their layouts match", () => {
    const sepIds = new Set(sep.services.map((service) => service.id));
    expect(oct.services.some((service) => sepIds.has(service.id))).toBe(false);
  });

  it("puts Sep 27 morning next, not a leftover October row at the same position", () => {
    const timeline = getTimeline([...sep.services, ...oct.services], now);
    const next = [...sep.services, ...oct.services].find((s) => s.id === timeline.nextId);
    expect(next?.startsAt).toBe("2026-09-27T10:30:00-07:00");
    expect(openingMonthIndex([sep, oct], now)).toBe(0);
    // Only the September services that have happened are "earlier".
    const past = sep.services.filter((s) => timeline.statusOf(s.id) === "past");
    expect(past.every((s) => (s.date ?? "") < "2026-09-27")).toBe(true);
  });

  it("reads 'Psalm 120 | #N/A' as a song with no key, not as a service", () => {
    const [first] = oct.services;
    expect(first.dateLabel).toBe("Sunday, October 4, 2026");
    expect(first.songs).toEqual([{ number: null, title: "Psalm 120", key: null }]);
    expect(first.pendingSongs).toBe(4);
    expect(oct.services.some((s) => s.dateLabel.startsWith("Psalm"))).toBe(false);
  });

  it("keeps each song in its own row, around the slots not filled in yet", () => {
    // Psalm 120 is the third row of five in the sheet, so it shows third.
    expect(serviceSlots(oct.services[0]).map((song) => song?.title ?? null)).toEqual([
      null,
      null,
      "Psalm 120",
      null,
      null,
    ]);
    // A service with no positions recorded lists its songs first.
    expect(
      serviceSlots({ ...oct.services[0], pendingPositions: undefined }).map((s) => s?.title ?? null),
    ).toEqual(["Psalm 120", null, null, null, null]);
    // A search drops the unfilled slots and keeps the songs.
    const [found] = filterServices([oct.services[0]], { query: "psalm", key: "" });
    expect(serviceSlots(found).map((song) => song?.title)).toEqual(["Psalm 120"]);
  });

  it("drops last year's rows and lists the rest of the month as not posted yet", () => {
    const planned = planMonth(oct, now);
    expect(planned.services.every((s) => s.date?.startsWith("2026-10-"))).toBe(true);
    expect(planned.services.map((s) => `${s.date?.slice(8)} ${s.slot}${s.placeholder ? "?" : ""}`)).toEqual([
      "04 AM",
      "04 PM",
      "07 PM",
      "11 AM?",
      "11 PM?",
      "14 PM?",
      "18 AM?",
      "18 PM?",
      "21 PM?",
      "25 AM?",
      "25 PM?",
      "28 PM?",
    ]);
    const wednesday = planned.services.find((s) => s.date === "2026-10-14");
    expect(wednesday).toMatchObject({
      dateLabel: "Wednesday, October 14, 2026",
      serviceLabel: "Evening Service",
      startsAt: "2026-10-14T19:00:00-07:00",
      songs: [],
    });
  });

  it("leaves a fully posted month alone", () => {
    expect(planMonth(sep, now)).toBe(sep);
  });

  it("does not add services that have already happened", () => {
    const later = Date.parse("2026-10-15T12:00:00-07:00");
    const dates = planMonth(oct, later).services.filter((s) => s.placeholder).map((s) => s.date);
    expect(dates[0]).toBe("2026-10-18");
  });

  it("keeps a dated heading with nothing written under it yet", () => {
    const month = parseMonthGrid("November", [["November Song List"], ["AM", "Sunday, November 1, 2026"]]);
    expect(month.services).toHaveLength(1);
    expect(month.services[0].songs).toEqual([]);
  });
});

describe("filterServices", () => {
  const { services } = parseMonthGrid("September", september as string[][]);
  const titles = (filtered: typeof services) =>
    filtered.flatMap((service) => service.songs.map((song) => song.title));

  it("matches hymnal numbers from the start, with or without #", () => {
    expect(titles(filterServices(services, { query: "233", key: "" }))).toEqual([
      "Tell Me the Old, Old Story",
    ]);
    expect(titles(filterServices(services, { query: "#233", key: "" }))).toEqual([
      "Tell Me the Old, Old Story",
    ]);
  });

  it("matches titles ignoring punctuation", () => {
    expect(titles(filterServices(services, { query: "hallelujah tis", key: "" }))).toEqual([
      "Hallelujah, 'Tis Done",
    ]);
  });

  it("filters by exact key, not by the letter appearing in a title", () => {
    const inCDorian = titles(filterServices(services, { query: "", key: "C Dorian" }));
    expect(new Set(inCDorian)).toEqual(new Set(["Psalm 15"]));
    const inF = filterServices(services, { query: "", key: "F" });
    expect(inF.every((service) => service.songs.every((song) => song.key === "F"))).toBe(true);
  });

  it("combines query and key", () => {
    expect(titles(filterServices(services, { query: "psalm", key: "Cm" }))).toEqual([
      "Psalm 54",
      "Psalm 54",
      "Psalm 54",
    ]);
  });
});

describe("keyMatches (typed key search)", () => {
  it("matches the same key however it is written", () => {
    expect(keyMatches("Ab", "ab")).toBe(true);
    expect(keyMatches("Ab ", "A♭")).toBe(true);
    expect(keyMatches("Ab", "A flat")).toBe(true);
    expect(keyMatches("Cm", "C minor")).toBe(true);
  });

  it("treats a bare tonic as that key and its modes, not a different key", () => {
    expect(keyMatches("C Dorian", "C")).toBe(true);
    expect(keyMatches("Cm", "C")).toBe(false);
    expect(keyMatches("C#", "C")).toBe(false);
    expect(keyMatches("Eb", "E")).toBe(false);
  });

  it("completes a partly typed mode", () => {
    expect(keyMatches("C Dorian", "c dor")).toBe(true);
    expect(keyMatches("C Dorian", "c ly")).toBe(false);
  });
});

describe("helpers", () => {
  it("songSlug gives one tidy address per song", () => {
    expect(songSlug("Hallelujah, 'Tis Done")).toBe("hallelujah-tis-done");
    expect(songSlug("Jesus, I My Cross Have Taken")).toBe(songSlug("Jesus I My Cross Have Taken"));
  });

  it("songKey groups spellings", () => {
    expect(songKey("Hallelujah, 'Tis Done")).toBe(songKey("hallelujah  'tis done!"));
  });

  it("listKeys orders keys musically and dedupes loosely", () => {
    expect(listKeys(["F", "Ab ", "C", "ab", "Cm", "C Dorian", null])).toEqual([
      "C",
      "Cm",
      "F",
      "Ab",
      "C Dorian",
    ]);
  });
});
