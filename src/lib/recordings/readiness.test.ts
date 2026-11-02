import { describe, expect, it } from "vitest";

import type { Recording, RecordingSelection } from "./model";
import { recordingCoverage, recordingSignals } from "./readiness";
import { catalogOf } from "./resolve";

function recording(id: string, songId: string, isPrimary = false): Recording {
  return {
    id,
    songId,
    provider: "youtube",
    mediaId: "dQw4w9WgXcQ",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: id,
    sourceName: null,
    description: null,
    arrangement: null,
    musicKey: null,
    visibility: "public",
    isPrimary,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

const slots = [
  { title: "Amazing Grace", number: "1", songId: "S1" },
  { title: "Holy, Holy, Holy", number: "2", songId: "S2" },
  null,
  { title: "Be Thou My Vision", number: "3", songId: "S3" },
];
const places = ["a", "b", "c", "d"];

describe("recording readiness in the planner", () => {
  it("mentions songs without a recording in one quiet line", () => {
    const catalog = catalogOf([recording("r1", "S1", true)]);
    expect(recordingSignals(slots, places, [], catalog)).toEqual([
      { kind: "no-recordings", placeIds: ["b", "d"], titles: ["Holy, Holy, Holy", "Be Thou My Vision"], all: false },
    ]);
    expect(recordingCoverage(slots, places, [], catalog)).toEqual({ withRecording: 1, songs: 3 });
  });

  it("says once when none of the songs has one", () => {
    const [signal] = recordingSignals(slots, places, [], catalogOf([]));
    expect(signal).toMatchObject({ kind: "no-recordings", all: true });
  });

  it("warns about a chosen recording that was deleted, on its own place", () => {
    const selections: RecordingSelection[] = [{ date: "2026-11-08", slot: "AM", placeId: "a", songId: "S1", recordingId: null }];
    const signals = recordingSignals(slots, places, selections, catalogOf([recording("r1", "S1", true)]));
    expect(signals[0]).toEqual({ kind: "recording-issue", placeId: "a", title: "Amazing Grace", reason: "removed" });
  });

  it("forgets a selection once its place holds another song (a replacement)", () => {
    const selections: RecordingSelection[] = [{ date: "2026-11-08", slot: "AM", placeId: "b", songId: "S1", recordingId: "r1" }];
    const catalog = catalogOf([recording("r1", "S1", true), recording("r2", "S2", true), recording("r3", "S3", true)]);
    expect(recordingSignals(slots, places, selections, catalog)).toEqual([]);
  });

  it("tells a song whose recordings have no primary apart from one with none", () => {
    const catalog = catalogOf([recording("r1", "S1", true), recording("r2", "S2")]);
    expect(recordingSignals(slots, places, [], catalog)).toEqual([
      { kind: "no-primary", placeIds: ["b"], titles: ["Holy, Holy, Holy"] },
      { kind: "no-recordings", placeIds: ["d"], titles: ["Be Thou My Vision"], all: false },
    ]);
    expect(recordingCoverage(slots, places, [], catalog)).toEqual({ withRecording: 1, songs: 3 });
  });

  it("follows a song moved to another position (the place ID moves with it)", () => {
    const selections: RecordingSelection[] = [{ date: "2026-11-08", slot: "AM", placeId: "a", songId: "S1", recordingId: "alt" }];
    const catalog = catalogOf([recording("main", "S1", true), recording("alt", "S1")]);
    const moved = [slots[1], slots[0]];
    expect(recordingCoverage(moved, ["b", "a"], selections, catalog)).toEqual({ withRecording: 1, songs: 2 });
    expect(recordingSignals(moved, ["b", "a"], selections, catalog)).toEqual([
      { kind: "no-recordings", placeIds: ["b"], titles: ["Holy, Holy, Holy"], all: false },
    ]);
  });
});
