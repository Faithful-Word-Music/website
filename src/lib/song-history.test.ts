import { describe, expect, it } from "vitest";

import {
  buildPlayIndex,
  buildSongRecords,
  mergeServices,
  pastServices,
  songHint,
} from "@/lib/song-history";
import type { DatedService } from "@/types/song-list";

const at = (iso: string) => Date.parse(iso);

function service(date: string, slot: "AM" | "PM", titles: string[]): DatedService {
  const time = slot === "AM" ? "10:30" : "18:00";
  return {
    date,
    slot,
    startsAt: `${date}T${time}:00-07:00`,
    songs: titles.map((title) => ({ number: null, title, key: "F" })),
  };
}

describe("mergeServices", () => {
  const now = at("2026-09-24T12:00:00-07:00");

  it("keeps stored services that have left the sheet", () => {
    const stored = [service("2025-09-07", "AM", ["Old Song"])];
    const merged = mergeServices(stored, [service("2026-09-06", "AM", ["New Song"])], now);
    expect(merged.map((item) => item.date)).toEqual(["2025-09-07", "2026-09-06"]);
  });

  it("lets the sheet correct a fresh service", () => {
    const stored = [service("2026-09-20", "AM", ["Typo Song"])];
    const merged = mergeServices(stored, [service("2026-09-20", "AM", ["Fixed Song"])], now);
    expect(merged[0].songs[0].title).toBe("Fixed Song");
  });

  it("never lets the sheet overwrite a frozen service", () => {
    const stored = [service("2025-10-05", "AM", ["What We Sang"])];
    const merged = mergeServices(stored, [service("2025-10-05", "AM", ["Half-edited"])], now);
    expect(merged[0].songs[0].title).toBe("What We Sang");
  });

  it("pastServices excludes anything not yet started", () => {
    const list = [service("2026-09-20", "AM", ["A"]), service("2026-09-27", "AM", ["B"])];
    expect(pastServices(list, now).map((item) => item.date)).toEqual(["2026-09-20"]);
  });
});

describe("buildSongRecords", () => {
  it("groups spellings, counts plays and keeps the latest title and number", () => {
    const services = [
      service("2026-01-04", "AM", ["Hallelujah 'Tis Done"]),
      {
        ...service("2026-05-03", "PM", []),
        songs: [{ number: "218", title: "Hallelujah, 'Tis Done", key: "G" }],
      },
    ];
    const [record] = buildSongRecords(services);
    expect(record.title).toBe("Hallelujah, 'Tis Done");
    expect(record.number).toBe("218");
    expect(record.plays.map((play) => play.key)).toEqual(["F", "G"]);
  });
});

describe("songHint", () => {
  const history = [
    service("2025-11-02", "AM", ["Autumn Hymn"]),
    service("2026-09-06", "AM", ["Psalm 15"]),
    service("2026-09-27", "AM", ["How Great Thou Art"]),
  ];
  const index = buildPlayIndex(history);
  const now = at("2026-09-24T12:00:00-07:00");
  const target = "2026-09-30T19:00:00-07:00";

  it("says first time ever for a song never sung before", () => {
    expect(songHint(index["never sung"], target, now)).toEqual({ kind: "first-ever" });
  });

  it("says first time this year when the last time was last year", () => {
    expect(songHint(index["autumn hymn"], target, now)).toEqual({ kind: "first-this-year" });
  });

  it("gives the last time sung when that has happened", () => {
    expect(songHint(index["psalm 15"], target, now)).toEqual({
      kind: "last-sung",
      at: new Date(at("2026-09-06T10:30:00-07:00")).toISOString(),
    });
  });

  it("points to an earlier upcoming service instead of pretending it was sung", () => {
    expect(songHint(index["how great thou art"], target, now).kind).toBe("also-on");
  });

  it("looks back from the service, not from today", () => {
    // Before Sep 6 itself, Psalm 15 had never been sung.
    expect(songHint(index["psalm 15"], "2026-09-06T10:30:00-07:00", now)).toEqual({
      kind: "first-ever",
    });
  });
});
