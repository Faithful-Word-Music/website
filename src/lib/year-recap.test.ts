import { describe, expect, it } from "vitest";

import { startsAtFor } from "@/lib/service-time";
import { availableYears, buildYearRecap, TOP_KEYS } from "@/lib/year-recap";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

/** A service from "YYYY-MM-DD", its slot, and songs written "number title key". */
function service(date: string, slot: ServiceSlot, songs: Array<[string | null, string, string | null]>): DatedService {
  return {
    date,
    slot,
    startsAt: startsAtFor(date, slot),
    songs: songs.map(([number, title, key]): Song => ({ number, title, key })),
  };
}

const history: DatedService[] = [
  service("2025-10-05", "AM", [["114", "The Great Physician", "Eb"], ["1", "Holy, Holy, Holy", "D"]]),
  service("2025-12-21", "PM", [["2", "Silent Night", "Bb"]]),
  service("2026-01-04", "AM", [["114", "The Great Physician", "Eb"], ["3", "Amazing Grace", "G"]]),
  service("2026-01-04", "PM", [["114", "The Great Physician", "E♭"], ["4", "It Is Well", "C"]]),
  service("2026-03-01", "AM", [["3", "Amazing Grace", "G"], ["1", "Holy Holy Holy", "D"]]),
  service("2026-03-04", "PM", [[null, "Psalm 23", "F"]]),
];

const septemberNow = Date.parse("2026-09-25T12:00:00-07:00");

describe("buildYearRecap", () => {
  const recap = buildYearRecap(history, 2026, septemberNow)!;

  it("counts the year's services and songs", () => {
    expect(recap.services).toBe(4);
    expect(recap.songsSung).toBe(7);
    expect(recap.differentSongs).toBe(5);
    expect(recap.differentHymns).toBe(4);
    expect(recap.partial).toBe("in-progress");
  });

  it("ranks the most sung, ties going to the more recent", () => {
    expect(recap.topSongs.map((song) => [song.title, song.count])).toEqual([
      ["Amazing Grace", 2],
      ["The Great Physician", 2],
      ["Psalm 23", 1],
      ["Holy Holy Holy", 1],
      ["It Is Well", 1],
    ]);
  });

  it("groups keys however they were written", () => {
    expect(recap.keys[0]).toEqual({ key: "Eb", count: 2 });
    expect(recap.keys.reduce((sum, entry) => sum + entry.count, 0)).toBe(7);
  });

  it("fills the months so far, leaving the rest of the year blank", () => {
    expect(recap.months.slice(0, 4)).toEqual([4, 0, 3, 0]);
    expect(recap.months[8]).toBe(0);
    expect(recap.months[9]).toBeNull();
    expect(recap.busiestMonths).toEqual([0]);
  });

  it("finds morning and evening favourites", () => {
    expect(recap.favourites.AM?.title).toBe("Amazing Grace");
    // Each sung once in the evening: the more recent wins.
    expect(recap.favourites.PM?.title).toBe("Psalm 23");
  });

  it("measures the longest wait across years", () => {
    // Holy, Holy, Holy: October 5, 2025 to March 1, 2026.
    expect(recap.longestWait?.title).toBe("Holy Holy Holy");
    expect(recap.longestWait?.days).toBe(147);
  });

  it("names the year's first song and the songs sung once", () => {
    expect(recap.firstSong?.title).toBe("The Great Physician");
    expect(recap.once.map((song) => song.title)).toEqual(["Psalm 23", "Holy Holy Holy", "It Is Well"]);
    expect(recap.once[0].startsAt).toBe("2026-03-04T19:00:00-07:00");
  });

  it("marks the year the records began, blanking the months before", () => {
    const first = buildYearRecap(history, 2025, septemberNow)!;
    expect(first.partial).toBe("records-began");
    expect(first.months.slice(8)).toEqual([null, 2, 0, 1]);
    expect(first.longestWait).toBeNull();
  });

  it("is null for a year with no services", () => {
    expect(buildYearRecap(history, 2019, septemberNow)).toBeNull();
  });

  it("folds rarely used keys together", () => {
    const keys = ["C", "D", "E", "F", "G", "A", "B", "Db", "Eb", "Gb"];
    const many = [service("2026-02-01", "AM", keys.map((key, i) => [String(i), `Song ${i}`, key]))];
    const folded = buildYearRecap(many, 2026, septemberNow)!.keys;
    expect(folded).toHaveLength(TOP_KEYS + 1);
    expect(folded.at(-1)).toEqual({ key: "2 others", count: 2, other: true });
  });
});

describe("availableYears", () => {
  it("lists each year once, oldest first", () => {
    expect(availableYears([...history].reverse())).toEqual([2025, 2026]);
  });
});
