import { describe, expect, it } from "vitest";

import type { Recording, RecordingSelection } from "./model";
import { buildPreparation, monthItems, playlistService, type PlaylistPlan } from "./playlist";
import { catalogOf, resolveRecording, selectionState } from "./resolve";

const NOW = Date.parse("2026-11-02T12:00:00-08:00");

function song(title: string, songId: string, key: string | null = "G") {
  return { title, number: "1", key, songId, insert: false };
}

function plan(date: string, slot: "AM" | "PM", status: PlaylistPlan["status"], titles: Array<[string, string] | null>): PlaylistPlan {
  return {
    date,
    slot,
    startsAt: `${date}T${slot === "AM" ? "10:30" : "18:00"}:00-08:00`,
    label: null,
    status,
    slots: titles.map((entry) => (entry ? song(entry[0], entry[1]) : null)),
    places: titles.map((_, index) => `n${date.replace(/-/g, "")}${slot}${index}`),
  };
}

function recording(id: string, songId: string, extra: Partial<Recording> = {}): Recording {
  return {
    id,
    songId,
    provider: "youtube",
    mediaId: `${id.padEnd(11, "x")}`.slice(0, 11),
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    title: `Recording ${id}`,
    sourceName: "Faithful Word Baptist Church",
    description: null,
    arrangement: null,
    musicKey: null,
    visibility: "public",
    isPrimary: false,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

describe("Preparation Playlists", () => {
  const plans = [
    plan("2026-11-01", "AM", "published", [["Past Song", "S0"]]),
    plan("2026-11-08", "AM", "published", [["Amazing Grace", "S1"], null, ["Holy, Holy, Holy", "S2"], ["Amazing Grace", "S1"]]),
    plan("2026-11-08", "PM", "draft", [["Secret Draft Song", "S9"]]),
    plan("2026-11-11", "PM", "cancelled", [["Cancelled Song", "S8"]]),
    plan("2026-12-06", "AM", "published", [["Joy to the World", "S3"]]),
  ];

  it("lists only upcoming published services, month by month, current and next together", () => {
    const months = buildPreparation(plans, [], NOW);
    expect(months.map((month) => month.month)).toEqual(["2026-11", "2026-12"]);
    const titles = months.flatMap(monthItems).map((item) => item.title);
    expect(titles).toEqual(["Amazing Grace", "Holy, Holy, Holy", "Amazing Grace", "Joy to the World"]);
    expect(titles).not.toContain("Secret Draft Song");
    expect(titles).not.toContain("Cancelled Song");
    expect(titles).not.toContain("Past Song");
  });

  it("keeps the planned order, positions and repeated songs; skips empty places", () => {
    const service = buildPreparation(plans, [], NOW)[0].services[0];
    expect(service.items.map((item) => [item.position, item.title])).toEqual([
      [1, "Amazing Grace"],
      [2, "Holy, Holy, Holy"],
      [3, "Amazing Grace"],
    ]);
    expect(new Set(service.items.map((item) => item.key)).size).toBe(3);
  });

  it("drops a month once its services have all happened", () => {
    const later = Date.parse("2026-11-30T12:00:00-08:00");
    expect(buildPreparation(plans, [], later).map((month) => month.month)).toEqual(["2026-12"]);
    expect(buildPreparation(plans, [], Date.parse("2027-01-01T00:00:00-08:00"))).toEqual([]);
  });

  it("carries nothing about song leaders", () => {
    const months = buildPreparation(plans, [], NOW);
    for (const item of months.flatMap(monthItems)) {
      expect(Object.keys(item).every((key) => ["key", "serviceId", "placeId", "position", "title", "number", "songId", "collection", "musicKey", "recordingSongId", "selection"].includes(key))).toBe(true);
    }
    expect(JSON.stringify(months)).not.toMatch(/leader|userId/i);
  });

  it("uses a service's chosen recording for its own place only, the primary elsewhere", () => {
    const target = plans[1];
    const selections: RecordingSelection[] = [
      { date: "2026-11-08", slot: "AM", placeId: target.places[3], songId: "S1", recordingId: "alt" },
    ];
    const catalog = catalogOf([recording("main", "S1", { isPrimary: true }), recording("alt", "S1")]);
    const items = playlistService(target, selections).items;
    const resolved = items.map((item) => resolveRecording(item.recordingSongId, item.selection, catalog));
    expect(resolved.map((entry) => (entry.kind === "primary" || entry.kind === "selected" ? [entry.kind, entry.recording.id] : [entry.kind]))).toEqual([
      ["primary", "main"],
      ["none"],
      ["selected", "alt"],
    ]);
  });
});

describe("which recording plays", () => {
  const catalog = catalogOf([recording("main", "S1", { isPrimary: true }), recording("alt", "S1"), recording("other", "S2")]);

  it("falls back to the primary only when nothing was chosen", () => {
    expect(resolveRecording("S1", { kind: "none" }, catalog)).toMatchObject({ kind: "primary", recording: { id: "main" } });
  });

  it("never substitutes the primary for a chosen recording that is gone", () => {
    expect(resolveRecording("S1", { kind: "removed" }, catalog)).toEqual({ kind: "issue", reason: "removed" });
  });

  it("reports a chosen recording this viewer may not see, rather than playing another", () => {
    expect(resolveRecording("S1", { kind: "chosen", recordingId: "members-only" }, catalog)).toEqual({ kind: "issue", reason: "unavailable" });
  });

  it("refuses a chosen recording of a different song", () => {
    expect(resolveRecording("S1", { kind: "chosen", recordingId: "other" }, catalog)).toEqual({ kind: "issue", reason: "unavailable" });
  });

  it("marks a song with no primary as having none - never another song's", () => {
    expect(resolveRecording("S3", { kind: "none" }, catalog)).toEqual({ kind: "none" });
    expect(resolveRecording(null, { kind: "none" }, catalog)).toEqual({ kind: "none" });
  });

  it("says a song with recordings but no primary is unset, and plays nothing", () => {
    expect(resolveRecording("S1", { kind: "none" }, catalogOf([recording("alt", "S1")]))).toEqual({ kind: "unset" });
  });

  it("ignores a selection once its place holds a different song", () => {
    const selection: RecordingSelection = { date: "2026-11-08", slot: "AM", placeId: "n1", songId: "S1", recordingId: "alt" };
    expect(selectionState(selection, "S2")).toEqual({ kind: "none" });
    expect(selectionState(selection, "S1")).toEqual({ kind: "chosen", recordingId: "alt" });
    expect(selectionState({ ...selection, recordingId: null }, "S1")).toEqual({ kind: "removed" });
  });

  it("leaves members-only primaries out for the public: those songs simply have none", () => {
    const publicOnly = catalogOf([recording("hidden", "S4", { isPrimary: true, visibility: "members" })].filter((item) => item.visibility === "public"));
    expect(resolveRecording("S4", { kind: "none" }, publicOnly)).toEqual({ kind: "none" });
  });
});
