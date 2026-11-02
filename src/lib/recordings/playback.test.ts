import { describe, expect, it } from "vitest";

import { INITIAL_PLAYBACK, playback, type PlaybackEvent, type PlaybackState } from "./playback";

function run(playable: boolean[], events: PlaybackEvent[], from: PlaybackState = INITIAL_PLAYBACK): PlaybackState {
  return events.reduce((state, event) => playback(state, event, playable), from);
}

describe("playlist playback", () => {
  // 0: playable, 1: no recording, 2: playable, 3: no recording, 4: playable
  const playable = [true, false, true, false, true];

  it("Play all starts at the first recording and skips songs without one", () => {
    const state = run(playable, [{ type: "PLAY_ALL" }]);
    expect(state).toMatchObject({ status: "loading", current: 0 });
    expect(run(playable, [{ type: "PLAY_ALL" }, { type: "STARTED" }, { type: "ENDED" }])).toMatchObject({ status: "loading", current: 2 });
  });

  it("finishes at the end instead of wrapping around", () => {
    const state = run(playable, [{ type: "PLAY_ALL" }, { type: "ENDED" }, { type: "ENDED" }, { type: "ENDED" }]);
    expect(state.status).toBe("finished");
    expect(run(playable, [{ type: "ENDED" }], state).status).toBe("finished");
  });

  it("next and previous move between playable recordings only", () => {
    let state = run(playable, [{ type: "PLAY_ALL" }, { type: "NEXT" }]);
    expect(state.current).toBe(2);
    state = run(playable, [{ type: "NEXT" }], state);
    expect(state.current).toBe(4);
    expect(run(playable, [{ type: "NEXT" }], state).current).toBe(4);
    state = run(playable, [{ type: "PREVIOUS" }, { type: "PREVIOUS" }], state);
    expect(state.current).toBe(0);
    expect(run(playable, [{ type: "PREVIOUS" }], state).current).toBe(0);
  });

  it("plays a chosen recording, and ignores a song without one", () => {
    expect(run(playable, [{ type: "SELECT", index: 2 }])).toMatchObject({ status: "loading", current: 2 });
    expect(run(playable, [{ type: "SELECT", index: 1 }])).toEqual(INITIAL_PLAYBACK);
  });

  it("skips a recording that fails and never tries it again by itself", () => {
    const state = run(playable, [{ type: "PLAY_ALL" }, { type: "ERROR" }]);
    expect(state).toMatchObject({ status: "loading", current: 2, failed: [0] });
    const back = run(playable, [{ type: "PREVIOUS" }], state);
    expect(back.current).toBe(2);
  });

  it("ends, rather than looping, when every recording fails", () => {
    const state = run(playable, [{ type: "PLAY_ALL" }, { type: "ERROR" }, { type: "ERROR" }, { type: "ERROR" }]);
    expect(state.status).toBe("finished");
    expect(state.failed).toEqual([0, 2, 4]);
    expect(run(playable, [{ type: "ERROR" }, { type: "ENDED" }, { type: "NEXT" }], state).status).toBe("finished");
  });

  it("does nothing on Play all when nothing can play", () => {
    expect(run([false, false], [{ type: "PLAY_ALL" }]).status).toBe("finished");
    expect(run([], [{ type: "PLAY_ALL" }, { type: "NEXT" }]).current).toBeNull();
  });

  it("pauses and resumes", () => {
    let state = run(playable, [{ type: "PLAY_ALL" }, { type: "STARTED" }, { type: "PAUSED" }]);
    expect(state.status).toBe("paused");
    state = run(playable, [{ type: "RESUME" }, { type: "STARTED" }], state);
    expect(state).toMatchObject({ status: "playing", current: 0 });
  });

  it("waits for a press when the browser blocks autoplay", () => {
    const state = run(playable, [{ type: "PLAY_ALL" }, { type: "ENDED" }, { type: "BLOCKED" }]);
    expect(state).toMatchObject({ status: "blocked", current: 2 });
    expect(run(playable, [{ type: "RESUME" }], state)).toMatchObject({ status: "loading", current: 2 });
  });

  it("Play all again gives failed recordings another chance", () => {
    const failed = run(playable, [{ type: "PLAY_ALL" }, { type: "ERROR" }, { type: "ERROR" }, { type: "ERROR" }]);
    expect(run(playable, [{ type: "PLAY_ALL" }], failed)).toMatchObject({ status: "loading", current: 0, failed: [] });
  });
});
