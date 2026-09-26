import { describe, expect, it } from "vitest";

import september from "@/lib/__fixtures__/september-2026.json";
import {
  formatServiceHeading,
  formatServicesText,
  inDateOrder,
  serviceName,
  shareTitle,
  SONG_LIST_URL,
} from "@/lib/share-services";
import { parseMonthGrid } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

const month = parseMonthGrid("September", september as string[][]);
const byDate = (date: string, slot: "AM" | "PM") =>
  month.services.find((service) => service.date === date && service.slot === slot)!;

const sundayMorning = byDate("2026-09-27", "AM");
const sundayEvening = byDate("2026-09-27", "PM");
const wednesday = byDate("2026-09-02", "PM");

describe("formatServiceHeading", () => {
  it("names the day, the service and its time", () => {
    expect(formatServiceHeading(sundayMorning)).toBe("Sunday, September 27 · Morning, 10:30 AM");
    expect(formatServiceHeading(wednesday)).toBe("Wednesday, September 2 · Evening, 7:00 PM");
  });

  it("falls back to the date as written when it cannot be read", () => {
    const odd: Service = { ...wednesday, dateLabel: "Christmas", slot: null, startsAt: null };
    expect(formatServiceHeading(odd)).toBe("Christmas");
  });
});

describe("formatServicesText", () => {
  it("lists one service's songs with numbers and keys, then the link", () => {
    expect(formatServicesText([sundayMorning])).toBe(
      [
        "Sunday, September 27 · Morning, 10:30 AM",
        "114  The Great Physician (Eb)",
        "24  And Can It Be That I Should Gain? (G)",
        "How Great Thou Art (Bb)",
        "119  Till the Storm Passes By (Eb)",
        "93  Art Thou Weary, Art Thou Languid? (F)",
        "",
        SONG_LIST_URL,
      ].join("\n"),
    );
  });

  it("puts several services in date order, whatever order they were picked in", () => {
    const text = formatServicesText([sundayEvening, wednesday, sundayMorning]);
    const headings = text.split("\n").filter((line) => line.includes(" · "));
    expect(headings).toEqual([
      "Wednesday, September 2 · Evening, 7:00 PM",
      "Sunday, September 27 · Morning, 10:30 AM",
      "Sunday, September 27 · Evening, 6:00 PM",
    ]);
    // One blank line between services.
    expect(text).toContain("Calvary (F)\n\nSunday, September 27");
  });

  it("adds the sheet's note above the link", () => {
    const text = formatServicesText([wednesday], { note: "Songs and Keys are subject to change" });
    expect(text.endsWith(`\n\nSongs and Keys are subject to change\n${SONG_LIST_URL}`)).toBe(true);
  });

  it("shows unfilled slots and keyless songs plainly", () => {
    const service: Service = {
      ...wednesday,
      songs: [{ number: null, title: "Psalm 23", key: null }],
      pendingSongs: 2,
    };
    expect(formatServicesText([service], { url: "" })).toBe(
      "Wednesday, September 2 · Evening, 7:00 PM\nPsalm 23\nTo be announced\nTo be announced",
    );
  });
});

describe("inDateOrder", () => {
  it("keeps undated services last, in their own order", () => {
    const undated = { ...wednesday, id: "x", startsAt: null };
    expect(inDateOrder([undated, sundayMorning, wednesday]).map((s) => s.id)).toEqual([
      wednesday.id,
      sundayMorning.id,
      "x",
    ]);
  });
});

describe("shareTitle", () => {
  it("names the day for one service, or for a Sunday's two", () => {
    expect(shareTitle([sundayMorning])).toBe("Songs for Sunday, September 27");
    expect(shareTitle([sundayMorning, sundayEvening])).toBe("Songs for Sunday, September 27");
  });

  it("counts services across several days", () => {
    expect(shareTitle([wednesday, sundayMorning, sundayEvening])).toBe("Songs for 3 services");
  });
});

describe("serviceName", () => {
  it("tells a Sunday's two services apart", () => {
    expect(serviceName(sundayMorning)).toBe("Sunday, September 27, Morning");
    expect(serviceName(sundayEvening)).toBe("Sunday, September 27, Evening");
  });
});
