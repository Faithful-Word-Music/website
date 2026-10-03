import { describe, expect, it } from "vitest";

import { exportFileName, exportMonths, exportRows, toCsv, type ExportService } from "./export";

const song = (title: string, key: string | null, insert = false, number: string | null = null) => ({ title, number, key, insert });

const services: ExportService[] = [
  {
    date: "2026-10-16",
    slot: "PM",
    startsAt: "2026-10-16T19:00:00-07:00",
    label: "Missions Conference",
    special: true,
    status: "published",
    slots: [song("Victory in Jesus", "Bb"), song("=SUM(A1)", null)],
  },
  {
    date: "2026-10-11",
    slot: "AM",
    startsAt: "2026-10-11T10:30:00-07:00",
    label: null,
    special: false,
    status: "draft",
    slots: [song("Amazing Grace", "G", false, "330"), null, song("Psalm 120", "D", true)],
  },
];

describe("raw export", () => {
  const rows = exportRows(services);

  it("has one row per song, in time order, with each song's own place and key", () => {
    expect(rows.map((row) => row.title)).toEqual(["Amazing Grace", "Psalm 120", "Victory in Jesus", "=SUM(A1)"]);
    expect(rows[0]).toMatchObject({
      date: "2026-10-11",
      weekday: "Sunday",
      service: "Sunday Morning",
      slot: "AM",
      startTime: "10:30",
      position: 1,
      number: "330",
      key: "G",
      insert: "No",
      special: "No",
      status: "draft",
    });
    expect(rows[1]).toMatchObject({ position: 3, insert: "Yes" });
    expect(rows[2]).toMatchObject({ service: "Missions Conference", special: "Yes", startTime: "19:00" });
  });

  it("writes CSV that spreadsheets read safely", () => {
    const csv = toCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("Date,Weekday,Service,AM/PM,Start time,Position,Hymn number,Song,Key,Insert,Special service,Status");
    // A title that looks like a formula is kept as text.
    expect(csv).toContain(",'=SUM(A1),");
  });

  it("names files by what they hold", () => {
    expect(exportFileName("raw", "2026-10-01", "2026-10-31", "xlsx")).toBe("Song List data 2026-10-01 to 2026-10-31.xlsx");
    expect(exportFileName("formatted", "2026-10-11", "2026-10-11", "pdf")).toBe("Song List 2026-10-11.pdf");
  });
});

describe("formatted export", () => {
  it("groups services into song-list months, empty places kept in position", () => {
    const [october] = exportMonths(services, 2026);
    expect(october).toMatchObject({ title: "October", heading: "October Song List" });
    expect(october.services.map((service) => service.id)).toEqual(["2026-10-11-am", "2026-10-16-pm"]);
    expect(october.services[0]).toMatchObject({ pendingSongs: 1, pendingPositions: [1] });
    expect(october.services[1].serviceLabel).toBe("Missions Conference");
  });
});
