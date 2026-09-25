import { describe, expect, it } from "vitest";

import missions from "@/lib/__fixtures__/missions-conference-2025.json";
import september from "@/lib/__fixtures__/september-2026.json";
import {
  datedServices,
  filterServices,
  keyMatches,
  listKeys,
  parseMonthGrid,
  songKey,
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

  it("captures the footnote without its asterisks", () => {
    expect(month.note).toBe("Songs and Keys are subject to change");
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
