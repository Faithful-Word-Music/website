import { describe, expect, it } from "vitest";

import { applyRecordingChange, type RecordingData } from "./changes";
import type { MediaLink, Recording } from "./model";

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

const link: MediaLink = {
  id: "l1",
  songId: "S1",
  url: "https://drive.google.com/x",
  source: "google-drive",
  title: "Folder",
  description: null,
  visibility: "public",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as MediaLink;

const where = { date: "2026-11-08", slot: "AM" as const };

function data(over: Partial<RecordingData> = {}): RecordingData {
  return { recordings: [], links: [], selections: [], ...over };
}

describe("applying a recording change in the browser", () => {
  it("adds a new recording, and a primary one takes over from the song's old primary only", () => {
    const before = data({ recordings: [recording("old", "S1", true), recording("other", "S2", true)] });
    const after = applyRecordingChange(before, { kind: "recording-saved", recording: recording("new", "S1", true) });
    expect(after.recordings.map((item) => [item.id, item.isPrimary])).toEqual([
      ["old", false],
      ["other", true],
      ["new", true],
    ]);
    expect(before.recordings[0].isPrimary).toBe(true);
  });

  it("replaces an edited recording in place", () => {
    const after = applyRecordingChange(data({ recordings: [recording("a", "S1")] }), {
      kind: "recording-saved",
      recording: { ...recording("a", "S1"), title: "Renamed" },
    });
    expect(after.recordings).toHaveLength(1);
    expect(after.recordings[0].title).toBe("Renamed");
  });

  it("deletes a recording, leaving a service that chose it pointing at nothing", () => {
    const before = data({
      recordings: [recording("a", "S1")],
      selections: [{ ...where, placeId: "p1", songId: "S1", recordingId: "a" }],
    });
    const after = applyRecordingChange(before, { kind: "recording-deleted", id: "a" });
    expect(after.recordings).toEqual([]);
    expect(after.selections[0].recordingId).toBeNull();
  });

  it("sets and clears a song's primary", () => {
    const before = data({ recordings: [recording("a", "S1", true), recording("b", "S1"), recording("c", "S2", true)] });
    const set = applyRecordingChange(before, { kind: "primary", songId: "S1", recordingId: "b" });
    expect(set.recordings.map((item) => item.isPrimary)).toEqual([false, true, true]);
    const cleared = applyRecordingChange(set, { kind: "primary", songId: "S1", recordingId: null });
    expect(cleared.recordings.map((item) => item.isPrimary)).toEqual([false, false, true]);
  });

  it("adds, edits and deletes links", () => {
    const added = applyRecordingChange(data(), { kind: "link-saved", link });
    const edited = applyRecordingChange(added, { kind: "link-saved", link: { ...link, title: "Renamed" } });
    expect(edited.links.map((item) => item.title)).toEqual(["Renamed"]);
    expect(applyRecordingChange(edited, { kind: "link-deleted", id: "l1" }).links).toEqual([]);
  });

  it("chooses a recording for one place, and goes back to the primary", () => {
    const chosen = applyRecordingChange(data(), { kind: "selection", placeId: "p1", songId: "S1", recordingId: "a" }, where);
    expect(chosen.selections).toEqual([{ ...where, placeId: "p1", songId: "S1", recordingId: "a" }]);
    const again = applyRecordingChange(chosen, { kind: "selection", placeId: "p1", songId: "S1", recordingId: "b" }, where);
    expect(again.selections.map((item) => item.recordingId)).toEqual(["b"]);
    expect(applyRecordingChange(again, { kind: "selection", placeId: "p1", songId: "S1", recordingId: null }, where).selections).toEqual([]);
  });
});
