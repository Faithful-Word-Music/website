import { songIdentity } from "@/lib/song-identity";
import type { Song } from "@/types/song-list";

import type { RecordingSelection } from "./model";
import { resolveRecording, selectionState, type RecordingCatalog, type Resolved, type SelectionState } from "./resolve";

/**
 * Recording readiness for the Service Planner: what each place of a service
 * will play, and what is worth a look. Pure.
 *
 * A song with no recording is normal - most songs may never have one - so it
 * is only ever mentioned, quietly, in one line. A recording chosen for this
 * service that cannot be used is different: someone chose it on purpose, so
 * it is a warning on its song.
 */

export interface PlaceRecording {
  placeId: string;
  selection: SelectionState;
  resolved: Resolved;
}

/** What one place will play. */
export function placeRecording(
  song: Pick<Song, "title" | "number" | "songId" | "collection"> | null,
  placeId: string,
  selections: readonly RecordingSelection[],
  catalog: RecordingCatalog,
): PlaceRecording | null {
  if (!song) return null;
  const songId = songIdentity(song) || null;
  const selection = selectionState(
    selections.find((item) => item.placeId === placeId),
    songId,
  );
  return { placeId, selection, resolved: resolveRecording(songId, selection, catalog) };
}

export type RecordingSignal =
  | { kind: "recording-issue"; placeId: string; title: string; reason: "removed" | "unavailable" | "unsupported" }
  | { kind: "no-recordings"; placeIds: string[]; titles: string[]; all: boolean };

export function recordingSignals(
  slots: ReadonlyArray<Pick<Song, "title" | "number" | "songId" | "collection"> | null>,
  places: readonly string[],
  selections: readonly RecordingSelection[],
  catalog: RecordingCatalog,
): RecordingSignal[] {
  const issues: RecordingSignal[] = [];
  const missing: { placeId: string; title: string }[] = [];
  let songs = 0;
  slots.forEach((song, index) => {
    const entry = placeRecording(song, places[index] ?? `p${index + 1}`, selections, catalog);
    if (!song || !entry) return;
    songs += 1;
    if (entry.resolved.kind === "issue") issues.push({ kind: "recording-issue", placeId: entry.placeId, title: song.title, reason: entry.resolved.reason });
    else if (entry.resolved.kind === "none") missing.push({ placeId: entry.placeId, title: song.title });
  });
  if (missing.length > 0) {
    issues.push({
      kind: "no-recordings",
      placeIds: missing.map((item) => item.placeId),
      titles: missing.map((item) => item.title),
      all: missing.length === songs,
    });
  }
  return issues;
}

/** How many of a service's songs have a recording to play: "3 of 5". */
export function recordingCoverage(
  slots: ReadonlyArray<Pick<Song, "title" | "number" | "songId" | "collection"> | null>,
  places: readonly string[],
  selections: readonly RecordingSelection[],
  catalog: RecordingCatalog,
): { withRecording: number; songs: number } {
  let withRecording = 0;
  let songs = 0;
  slots.forEach((song, index) => {
    const entry = placeRecording(song, places[index] ?? `p${index + 1}`, selections, catalog);
    if (!entry) return;
    songs += 1;
    if (entry.resolved.kind === "selected" || entry.resolved.kind === "primary") withRecording += 1;
  });
  return { withRecording, songs };
}
