import { describe, expect, it } from "vitest";

import missions from "@/lib/__fixtures__/missions-conference-2025.json";
import september from "@/lib/__fixtures__/september-2026.json";
import { parseMonthGrid } from "@/lib/song-list";
import {
  columnSpace,
  layoutMonth,
  monthPdfPath,
  monthSlug,
  pdfFileName,
  PDF_METRICS,
  serviceHeight,
  splitColumns,
  titleLines,
} from "@/lib/song-list-pdf";
import type { Service, SongListMonth } from "@/types/song-list";

const months: Array<[string, SongListMonth]> = [
  ["September 2026", parseMonthGrid("September", september as string[][])],
  ["Missions Conference 2025", parseMonthGrid("Missions Conference", missions as string[][])],
];

function service(id: string, songs: number): Service {
  return {
    id,
    dateLabel: "Sunday, September 6, 2026",
    serviceLabel: null,
    slot: "AM",
    date: "2026-09-06",
    startsAt: "2026-09-06T10:30:00-07:00",
    songs: Array.from({ length: songs }, (_, index) => ({
      number: String(index + 1),
      title: "Amazing Grace",
      key: "G",
    })),
    pendingSongs: 0,
  };
}

describe.each(months)("layoutMonth on the real %s tab", (_, month) => {
  const layout = layoutMonth(month);

  it("keeps every service, in date order, left column then right", () => {
    expect([...layout.left, ...layout.right]).toEqual(month.services);
  });

  it("fits the whole month on one page", () => {
    const { tallest } = splitColumns(month.services, layout.rowPt, layout.gapPt);
    expect(tallest).toBeLessThanOrEqual(columnSpace(month));
  });

  it("keeps rows within their limits", () => {
    expect(layout.rowPt).toBeGreaterThanOrEqual(PDF_METRICS.minRowPt);
    expect(layout.rowPt).toBeLessThanOrEqual(PDF_METRICS.maxRowPt);
  });

  it("balances the columns to within one service", () => {
    const heights = [layout.left, layout.right].map((column) =>
      column.reduce((total, item) => total + serviceHeight(item, layout.rowPt), 0),
    );
    const largest = Math.max(...month.services.map((item) => serviceHeight(item, layout.rowPt)));
    expect(Math.abs(heights[0] - heights[1])).toBeLessThanOrEqual(largest + layout.gapPt);
  });
});

describe("splitColumns", () => {
  it("splits evenly when the services are alike, the left column taking the odd one", () => {
    const services = ["a", "b", "c", "d", "e"].map((id) => service(id, 5));
    const { left, right } = splitColumns(services, 14, 10);
    expect(left.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(right.map((s) => s.id)).toEqual(["d", "e"]);
  });

  it("moves the split to balance a long service", () => {
    const services = [service("a", 12), service("b", 3), service("c", 3), service("d", 3)];
    const { left, right } = splitColumns(services, 14, 10);
    expect(left.map((s) => s.id)).toEqual(["a"]);
    expect(right.map((s) => s.id)).toEqual(["b", "c", "d"]);
  });

  it("handles a month of one service", () => {
    const { left, right } = splitColumns([service("a", 4)], 14, 10);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(0);
  });
});

describe("layoutMonth", () => {
  it("gives a light month generous rows", () => {
    const month: SongListMonth = {
      title: "Light",
      heading: null,
      note: null,
      services: [service("a", 4), service("b", 4)],
      fallbackRows: null,
    };
    expect(layoutMonth(month).rowPt).toBe(PDF_METRICS.maxRowPt);
  });
});

describe("titleLines", () => {
  it("keeps ordinary hymn titles on one line", () => {
    expect(titleLines("When the Roll Is Called Up Yonder")).toBe(1);
    expect(titleLines("There Shall Be Showers of Blessing")).toBe(1);
  });

  it("plans a second line for a very long title", () => {
    expect(titleLines("Lord, I Care Not for Riches, Neither Silver Nor Gold, Make Me Sure")).toBe(2);
  });
});

describe("monthSlug and friends", () => {
  it("makes plain addresses from tab titles", () => {
    expect(monthSlug("September")).toBe("september");
    expect(monthSlug("Missions Conference 2025")).toBe("missions-conference-2025");
    expect(monthSlug("  Réunion / Special  ")).toBe("reunion-special");
    expect(monthPdfPath("September")).toBe("/song-list/pdf/september");
  });

  it("names the file after the sheet's own heading", () => {
    expect(pdfFileName(months[0][1])).toBe("September Song List.pdf");
    expect(
      pdfFileName({ title: "October", heading: null, note: null, services: [], fallbackRows: null }),
    ).toBe("October Song List.pdf");
  });
});
