/**
 * The Preparation Playlist's player, as a state machine: what happens on
 * Play all, Next, a recording finishing, a recording failing. Pure, so every
 * path is tested without a browser (playback.test.ts).
 *
 * Items are the playlist in order. Only `playable` ones are ever played;
 * a song with no recording is skipped. A recording that fails is marked and
 * never tried again on its own, and the end of the list is the end - nothing
 * wraps around - so a run of failures can never loop.
 */

export type PlaybackStatus =
  /** Nothing chosen yet. */
  | "idle"
  /** A recording is being loaded into the player. */
  | "loading"
  | "playing"
  | "paused"
  /** The browser would not start the next recording by itself (autoplay rules): press play. */
  | "blocked"
  /** Played to the end, or nothing left that can play. */
  | "finished";

export interface PlaybackState {
  status: PlaybackStatus;
  /** Index into the items of what is loaded, or null. */
  current: number | null;
  /** Indexes that failed to play this session. */
  failed: readonly number[];
  /** Whether finishing one recording moves on to the next (Play all), or stops (one chosen). */
  continuous: boolean;
}

export type PlaybackEvent =
  | { type: "PLAY_ALL" }
  | { type: "SELECT"; index: number }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "STARTED" }
  | { type: "PAUSED" }
  | { type: "RESUME" }
  | { type: "ENDED" }
  | { type: "ERROR" }
  | { type: "BLOCKED" }
  | { type: "STOP" };

export const INITIAL_PLAYBACK: PlaybackState = { status: "idle", current: null, failed: [], continuous: true };

/** The next index at or after `from` that can play and has not failed, or null. */
export function nextPlayable(playable: readonly boolean[], failed: readonly number[], from: number): number | null {
  for (let index = Math.max(0, from); index < playable.length; index += 1) {
    if (playable[index] && !failed.includes(index)) return index;
  }
  return null;
}

/** The nearest index before `from` that can play and has not failed, or null. */
export function previousPlayable(playable: readonly boolean[], failed: readonly number[], from: number): number | null {
  for (let index = Math.min(playable.length - 1, from); index >= 0; index -= 1) {
    if (playable[index] && !failed.includes(index)) return index;
  }
  return null;
}

function loadOr(state: PlaybackState, index: number | null, continuous = state.continuous): PlaybackState {
  return index === null
    ? { ...state, status: "finished", continuous }
    : { ...state, status: "loading", current: index, continuous };
}

/**
 * The next state. `playable[i]` says whether item i has a recording this
 * viewer can play.
 */
export function playback(state: PlaybackState, event: PlaybackEvent, playable: readonly boolean[]): PlaybackState {
  switch (event.type) {
    case "PLAY_ALL":
      // Starts again from the top, giving earlier failures another chance: the person asked.
      return loadOr({ ...state, failed: [] }, nextPlayable(playable, [], 0), true);

    case "SELECT": {
      if (!playable[event.index]) return state;
      // Choosing one recording plays it - and, when it is part of Play all, carries on afterwards.
      const failed = state.failed.filter((index) => index !== event.index);
      return { ...state, failed, status: "loading", current: event.index };
    }

    case "NEXT": {
      const from = state.current === null ? 0 : state.current + 1;
      const index = nextPlayable(playable, state.failed, from);
      return index === null ? state : { ...state, status: "loading", current: index };
    }

    case "PREVIOUS": {
      if (state.current === null) return state;
      const index = previousPlayable(playable, state.failed, state.current - 1);
      return index === null ? state : { ...state, status: "loading", current: index };
    }

    case "STARTED":
      return state.current === null ? state : { ...state, status: "playing" };

    case "PAUSED":
      return state.status === "playing" || state.status === "loading" ? { ...state, status: "paused" } : state;

    case "RESUME":
      if (state.current === null) return playback(state, { type: "PLAY_ALL" }, playable);
      if (state.status === "finished") return state;
      return { ...state, status: "loading" };

    case "ENDED": {
      if (state.current === null) return state;
      if (!state.continuous) return { ...state, status: "finished" };
      return loadOr(state, nextPlayable(playable, state.failed, state.current + 1));
    }

    case "ERROR": {
      if (state.current === null) return state;
      const failed = state.failed.includes(state.current) ? state.failed : [...state.failed, state.current];
      // A failure moves on (past every failed one) only during Play all; a single choice just stops.
      if (!state.continuous) return { ...state, failed, status: "finished" };
      return loadOr({ ...state, failed }, nextPlayable(playable, failed, state.current + 1));
    }

    case "BLOCKED":
      return state.current === null ? state : { ...state, status: "blocked" };

    case "STOP":
      return { ...INITIAL_PLAYBACK, failed: state.failed };
  }
}
