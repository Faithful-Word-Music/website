import { describe, expect, it } from "vitest";

import {
  buildQuarterlyReport,
  previousQuarter,
  quarterBounds,
  quarterId,
  quarterLabel,
  reportQuarter,
} from "@/lib/quarterly-report";
import { LIST_ITEMS, renderQuarterlyReport } from "@/lib/quarterly-report-email";
import { startsAtFor } from "@/lib/service-time";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

/** A service from "YYYY-MM-DD", its slot, and songs written [number, title, key]. */
function service(date: string, slot: ServiceSlot, songs: Array<[string | null, string, string | null]>): DatedService {
  return {
    date,
    slot,
    startsAt: startsAtFor(date, slot),
    songs: songs.map(([number, title, key]): Song => ({ number, title, key })),
  };
}

const at = (date: string, time = "07:00") => Date.parse(`${date}T${time}:00-07:00`);

describe("quarters", () => {
  it("reports on the quarter that has just ended, in church time", () => {
    expect(reportQuarter(at("2026-10-01"))).toEqual({ year: 2026, index: 2 });
    expect(reportQuarter(at("2027-01-01"))).toEqual({ year: 2026, index: 3 });
    // 11 PM on December 31 in Arizona is already January 1 in UTC.
    expect(reportQuarter(at("2026-12-31", "23:00"))).toEqual({ year: 2026, index: 2 });
  });

  it("names and bounds a quarter", () => {
    const q = { year: 2026, index: 2 };
    expect(quarterId(q)).toBe("2026-Q3");
    expect(quarterLabel(q)).toBe("Jul–Sep 2026");
    expect(quarterBounds(q)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(quarterBounds({ year: 2028, index: 0 }).to).toBe("2028-03-31");
    expect(previousQuarter({ year: 2027, index: 0 })).toEqual({ year: 2026, index: 3 });
  });
});

/** Every Sunday morning from `start` for `weeks` weeks, each with the given songs. */
function sundays(start: string, weeks: number, songs: (week: number) => Array<[string | null, string, string | null]>) {
  const first = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: weeks }, (_, week) =>
    service(new Date(first + week * 7 * 86_400_000).toISOString().slice(0, 10), "AM", songs(week)),
  );
}

describe("buildQuarterlyReport", () => {
  // Records begin October 2025. "Holy" is sung every month until spring, then dropped;
  // "Grace" every week of Q3 2026; "Silent Night" only at Christmas.
  const history: DatedService[] = [
    ...sundays("2025-10-05", 26, (week) => [
      ["1", "Holy, Holy, Holy", "D"],
      week % 4 === 0 ? ["3", "Amazing Grace", "G"] : [null, "Psalm 23", "F"],
      ["50", week % 2 ? "It Is Well" : "Blessed Assurance", "C"],
      ...(week % 5 === 0 ? [["95", "Doxology", "G"] as [string, string, string]] : []),
    ]),
    service("2025-12-25", "AM", [["5", "Joy to the World", "D"]]),
    service("2025-12-21", "PM", [["2", "Silent Night", "Bb"], ["9", "O Come All Ye Faithful", "G"]]),
    service("2025-11-26", "PM", [["7", "Count Your Blessings", "D"]]),
    ...sundays("2026-07-05", 13, (week) => [
      ["3", "Amazing Grace", "G"],
      week === 5 ? [null, "A New Song", "E"] : ["50", "It Is Well", "C"],
      ["60", "Blessed Assurance", "C"],
    ]),
  ];
  const upcoming = [service("2026-10-04", "AM", [["60", "Blessed Assurance", "C"], ["20", "Rock of Ages", "A"]])];
  const report = buildQuarterlyReport(history, upcoming, at("2026-10-01"));

  it("counts the quarter", () => {
    expect(report.id).toBe("2026-Q3");
    expect(report.totals.services).toBe(13);
    expect(report.totals.songsSung).toBe(39);
    expect(report.totals.differentSongs).toBe(4);
    expect(report.recordsBegan).toBe("2025-10-05");
  });

  it("compares only with quarters the records fully cover", () => {
    // Apr-Jun 2026 is covered by the records, and had no services.
    expect(report.previous?.services).toBe(0);
    expect(report.lastYear).toBeNull();
  });

  it("ranks the most sung, with all-time counts", () => {
    expect(report.topSongs[0]).toMatchObject({ title: "Amazing Grace", count: 13, allTime: 13 + 7 });
  });

  it("flags a song that came round every week as possibly overused", () => {
    const grace = report.overused.find((song) => song.title === "Amazing Grace");
    expect(grace?.visits).toBe(13);
    expect(grace?.usual).not.toBeNull();
  });

  it("finds songs past their usual gap", () => {
    expect(report.due).toEqual([expect.objectContaining({ title: "Doxology", usualDays: 35 })]);
  });

  it("finds forgotten favourites, leaving out anything scheduled or already due", () => {
    expect(report.forgotten.map((song) => song.title)).not.toContain("Doxology");
    expect(report.forgotten.map((song) => song.title)).toContain("Psalm 23");
    expect(report.forgotten.map((song) => song.title)).not.toContain("Blessed Assurance");
  });

  it("names new songs only once the records reach a year back", () => {
    // Records began October 2025, less than a year before July 2026.
    expect(report.newSongs).toBeNull();

    const later = [...history, service("2026-11-01", "AM", [[null, "Another New Song", "D"]])];
    const january = buildQuarterlyReport(later, [], at("2027-01-01"));
    expect(january.newSongs).toEqual([
      expect.objectContaining({ title: "Another New Song", count: 1, visits: 1, scheduled: false }),
    ]);
  });

  it("leaves new songs out when the records began during the quarter", () => {
    const young = buildQuarterlyReport(history.filter((s) => s.date >= "2026-07-10"), [], at("2026-10-01"));
    expect(young.newSongs).toBeNull();
    expect(young.previous).toBeNull();
  });

  it("summarises keys, openers and closers", () => {
    expect(report.keys[0]).toMatchObject({ key: "C", count: 25 });
    expect(report.openers[0]).toMatchObject({ title: "Amazing Grace", count: 13 });
    expect(report.closers[0]).toMatchObject({ title: "Blessed Assurance", count: 13 });
  });

  it("looks back at the coming quarter a year ago", () => {
    const ahead = report.lookahead;
    expect(ahead.label).toBe("Oct–Dec 2026");
    expect(ahead.scheduledServices).toBe(1);
    const seasonal = ahead.lastYear!.seasonal.map((song) => song.title);
    expect(seasonal).toContain("Count Your Blessings");
    expect(seasonal).not.toContain("Amazing Grace");
    // Christmas songs are never suggested alongside October's.
    expect(seasonal).not.toContain("Silent Night");
    // Christmas Day fell on a Thursday: outside the regular week. The Wednesday before Thanksgiving is not.
    expect(ahead.lastYear!.specials).toEqual([{ startsAt: startsAtFor("2025-12-25", "AM"), songs: ["Joy to the World"] }]);
  });

  it("keeps Christmas songs for the Christmas season", () => {
    const christmas = report.lookahead.christmas!;
    expect(christmas.thanksgiving).toBe("2026-11-26");
    expect(christmas.from).toBe("2026-11-27");
    expect(christmas.songs.map((song) => song.title).sort()).toEqual(
      ["Joy to the World", "O Come All Ye Faithful", "Silent Night"],
    );
    const everyList = [...report.due, ...report.forgotten, ...report.overused].map((song) => song.title);
    expect(everyList).not.toContain("Joy to the World");
  });

  it("has no Christmas list in other quarters", () => {
    expect(buildQuarterlyReport(history, [], at("2027-01-01")).lookahead.christmas).toBeNull();
  });

  it("flags a Christmas song scheduled before the first service after Thanksgiving", () => {
    const early = [
      service("2026-11-22", "AM", [["2", "Silent Night", "Bb"]]),
      service("2026-11-29", "AM", [["2", "Silent Night", "Bb"], ["9", "O Come All Ye Faithful", "G"]]),
    ];
    const flagged = buildQuarterlyReport(history, early, at("2026-10-01")).lookahead.outOfSeason;
    expect(flagged).toEqual([expect.objectContaining({ title: "Silent Night", startsAt: early[0].startsAt })]);
  });

  it("does not call carols through the season close repeats", () => {
    const december = [
      service("2026-12-06", "AM", [["2", "Silent Night", "Bb"]]),
      service("2026-12-20", "AM", [["2", "Silent Night", "Bb"]]),
    ];
    expect(buildQuarterlyReport(history, december, at("2026-10-01")).lookahead.repeats).toEqual([]);
  });

  it("flags scheduled songs sung only a short while before", () => {
    expect(report.lookahead.repeats).toEqual([
      expect.objectContaining({ title: "Blessed Assurance", days: 7 }),
    ]);
  });

  it("traces variety back through every quarter the records cover", () => {
    expect(report.trend.map((entry) => [entry.label, entry.totals.differentSongs, entry.current])).toEqual([
      ["Oct–Dec 2025", 10, false],
      ["Jan–Mar 2026", 6, false],
      ["Apr–Jun 2026", 0, false],
      ["Jul–Sep 2026", 4, true],
    ]);
  });

  it("copes with no history at all", () => {
    const empty = buildQuarterlyReport([], [], at("2026-10-01"));
    expect(empty.totals.services).toBe(0);
    expect(empty.topSongs).toEqual([]);
    expect(empty.lookahead.lastYear).toBeNull();
  });
});

describe("renderQuarterlyReport", () => {
  const history = [
    service("2025-10-05", "AM", [["1", "Holy, Holy, Holy", "D"]]),
    service("2026-07-05", "AM", [[null, "<script>alert(1)</script>", "G"], ["2", "It Is Well", "C"]]),
    service("2026-07-08", "PM", [[null, "<script>alert(1)</script>", "G"]]),
    service("2026-07-12", "AM", ["A", "B", "C", "D", "E", "F", "G", "H"].map((letter): [string, string, string] => ["9", `Song ${letter}`, "F"])),
  ];
  const email = renderQuarterlyReport(buildQuarterlyReport(history, [], at("2026-10-01")));
  // The same quarter with a song sung across four weeks, so "Most sung" has something to show.
  const standout = [
    ...history,
    ...["2026-08-02", "2026-08-16"].map((date) => service(date, "AM", [[null, "<script>alert(1)</script>", "G"]])),
  ];
  const busyEmail = renderQuarterlyReport(buildQuarterlyReport(standout, [], at("2026-10-01")));

  it("titles the email by quarter", () => {
    expect(email.subject).toBe("Your quarterly song report: Jul–Sep 2026");
    expect(email.text).toContain("July – September 2026");
  });

  it("escapes titles from the sheet", () => {
    expect(busyEmail.html).not.toContain("<script>");
    expect(busyEmail.html).toContain("&lt;script&gt;");
  });

  it("never breaks a style attribute with a double quote", () => {
    // A font name in double quotes once ended the attribute early, losing every style after it.
    expect(email.html).not.toMatch(/style="[^"]*"[^\s>]/);
    expect(email.html).toContain("Source Serif 4");
  });

  it("supports dark mode where the mail app allows", () => {
    expect(email.html).toContain('name="color-scheme" content="light dark"');
    expect(email.html).toContain("prefers-color-scheme:dark");
  });

  it("lists only songs that stand out as most sung, and keeps the list short", () => {
    // Six songs each sung in four separate weeks: all stand out, five are shown.
    const busy = [...history];
    for (const date of ["2026-07-19", "2026-08-02", "2026-08-16", "2026-08-30"]) {
      busy.push(service(date, "AM", ["P", "Q", "R", "S", "T", "U"].map((letter): [null, string, string] => [null, `Busy ${letter}`, "D"])));
    }
    const text = renderQuarterlyReport(buildQuarterlyReport(busy, [], at("2026-10-01"))).text;
    const lines = text.split("MOST SUNG")[1].split("\n\n")[0].split("\n").filter((line) => line.startsWith("- "));
    expect(lines).toHaveLength(LIST_ITEMS);
    expect(lines.every((line) => line.includes("4 times"))).toBe(true);
  });

  it("leaves out sections with nothing to say", () => {
    // Nothing was sung more than twice, so no song stands out.
    expect(email.text).not.toContain("MOST SUNG");
    expect(email.text).toContain("KEYS");
    expect(email.text).not.toContain("FORGOTTEN FAVOURITES");
    expect(email.text).not.toContain("DUE TO COME BACK");
    // Sung in October last year and not since: suggested for the season ahead.
    expect(email.text).toContain("FOR OCT–DEC");
  });

  it("charts variety and keys, with every value printed", () => {
    expect(email.text).toContain("VARIETY BY QUARTER");
    expect(email.text).toContain("- Jul–Sep 2026: 10 different songs (this quarter)");
    expect(email.text).toContain("- Oct–Dec 2025: 1 different song\n");
    expect(email.text).toContain("- F: 73% (8 times)");
  });

  it("keeps every list's hymn-number column, marking a missing number", () => {
    const mostSung = busyEmail.html.split("Most sung")[1].split("<h3")[0];
    expect(mostSung).toContain("·");
  });

  it("notes when the archive database was not available", () => {
    const sheetOnly = renderQuarterlyReport(buildQuarterlyReport(history, [], at("2026-10-01")), false);
    expect(sheetOnly.text).toContain("archive database could not be read");
  });
});
