import { describe, expect, it } from "vitest";

import type { DatedService } from "@/types/song-list";

import { filterArchive, NO_FILTER, toArchive } from "./service-archive";

const service = (date: string, slot: "AM" | "PM", songs: Array<[string, string | null, boolean?]>, extra: Partial<DatedService> = {}): DatedService => ({
  date,
  slot,
  startsAt: `${date}T${slot === "AM" ? "10:30" : "18:00"}:00-07:00`,
  songs: songs.map(([title, key, insert]) => ({ title, number: title === "Amazing Grace" ? "330" : null, key, ...(insert ? { insert } : {}) })),
  ...extra,
});

const archive = toArchive([
  service("2025-12-21", "AM", [["O Come All Ye Faithful", "G"], ["Psalm 120", "D", true]]),
  service("2026-10-04", "AM", [["Amazing Grace", "G"], ["Psalm 54", "E", true]]),
  service("2026-10-04", "PM", [["Amazing Grace", "Ab"], ["Psalm 54", "E", true]]),
  service("2026-10-07", "PM", [["Victory in Jesus", "Bb"]]),
  service("2026-10-16", "PM", [["Victory in Jesus", "Bb"]], { kind: "special", label: "Missions Conference" }),
  service("2025-03-14", "PM", [["Victory in Jesus", "Bb"]]), // a Friday, from before services were marked special
]);
const anchors = (filter: Partial<typeof NO_FILTER>) => filterArchive(archive, { ...NO_FILTER, ...filter }).map((item) => item.anchor);

describe("the service-plan archive", () => {
  it("lists services newest first, each with its address", () => {
    expect(archive[0]).toMatchObject({ anchor: "2026-10-16-pm", special: true, label: "Missions Conference" });
    expect(archive.at(-1)?.anchor).toBe("2025-03-14-pm");
  });

  it("treats an older service outside the weekly pattern as special", () => {
    expect(archive.find((item) => item.anchor === "2025-03-14-pm")?.special).toBe(true);
  });

  it("filters by date range and service type", () => {
    expect(anchors({ from: "2026-10-01", to: "2026-10-05" })).toEqual(["2026-10-04-pm", "2026-10-04-am"]);
    expect(anchors({ type: "wednesday" })).toEqual(["2026-10-07-pm"]);
    expect(anchors({ type: "sundayEvening" })).toEqual(["2026-10-04-pm"]);
    expect(anchors({ type: "special" })).toEqual(["2026-10-16-pm", "2025-03-14-pm"]);
  });

  it("finds services by song, number and key - the same song meeting both", () => {
    expect(anchors({ song: "psalm 120" })).toEqual(["2025-12-21-am"]);
    expect(anchors({ song: "330" })).toEqual(["2026-10-04-pm", "2026-10-04-am"]);
    expect(anchors({ song: "amazing", key: "Ab" })).toEqual(["2026-10-04-pm"]);
    expect(anchors({ song: "psalm 54", key: "G" })).toEqual([]);
  });

  it("finds services by their insert", () => {
    expect(anchors({ insertOnly: true, song: "psalm" })).toEqual(["2026-10-04-pm", "2026-10-04-am", "2025-12-21-am"]);
    expect(anchors({ insertOnly: true, song: "amazing" })).toEqual([]);
  });
});
