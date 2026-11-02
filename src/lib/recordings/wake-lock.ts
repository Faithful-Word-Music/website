/**
 * Keep Screen Awake, for the Preparation Playlists: while a playlist is
 * actually playing, ask the browser not to turn the screen off (the Screen
 * Wake Lock API). It is a foreground convenience only - it does not make
 * anything play in the background, and the person can still lock the device
 * themselves.
 *
 * The controller is plain TypeScript with its browser parts passed in, so
 * every path is tested without a browser (wake-lock.test.ts). The rules:
 *
 *   - A lock is held only while `wanted` (playing, and the setting is on)
 *     and the page is visible. Anything else releases it.
 *   - At most one request is ever in flight; a request that comes back after
 *     it stopped being wanted is released straight away.
 *   - The system may revoke a lock (the page was hidden, battery saving).
 *     It is asked for again only when the page is visible again or playback
 *     starts again - never in a loop.
 *   - A refused request is not repeated until something changes (play
 *     starts again, or the page becomes visible again).
 */

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

export interface WakeLockEnvironment {
  /** navigator.wakeLock, or undefined where it is not supported. */
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  isVisible(): boolean;
  /** Calls back when the page is shown or hidden; returns how to stop. */
  onVisibilityChange(listener: () => void): () => void;
}

export type WakeLockStatus =
  /** This browser cannot keep the screen awake. */
  | "unsupported"
  /** Not needed now (not playing, or the setting is off). */
  | "idle"
  /** Being asked for. */
  | "requesting"
  /** The screen is being kept awake. */
  | "active"
  /** Wanted, but not held right now: the page is hidden, or the system let it go. */
  | "waiting"
  /** The browser refused (permissions, battery saver, policy). */
  | "refused";

export class WakeLockController {
  private wanted = false;
  private refused = false;
  private disposed = false;
  private sentinel: WakeLockSentinelLike | null = null;
  private pending = false;
  /** Bumped whenever an outstanding request stops being wanted. */
  private generation = 0;
  private current: WakeLockStatus;
  private readonly stopListening: () => void;

  constructor(
    private readonly env: WakeLockEnvironment,
    private readonly onStatus: (status: WakeLockStatus) => void = () => {},
  ) {
    this.current = env.wakeLock ? "idle" : "unsupported";
    this.stopListening = env.onVisibilityChange(() => {
      // Shown again: one fresh try, even after a refusal or a revocation.
      if (this.env.isVisible()) this.refused = false;
      this.sync();
    });
  }

  get status(): WakeLockStatus {
    return this.current;
  }

  /** Whether the screen should be kept awake now: playing, with the setting on. */
  setWanted(wanted: boolean): void {
    if (this.disposed || wanted === this.wanted) return;
    this.wanted = wanted;
    // Starting again is a new chance after a refusal.
    if (wanted) this.refused = false;
    this.sync();
  }

  /** Releases everything and stops listening. For when the player goes away. */
  dispose(): void {
    if (this.disposed) return;
    this.wanted = false;
    this.sync();
    this.disposed = true;
    this.stopListening();
  }

  private setStatus(status: WakeLockStatus) {
    if (status === this.current) return;
    this.current = status;
    this.onStatus(status);
  }

  private shouldHold(): boolean {
    return !this.disposed && this.wanted && !this.refused && this.env.isVisible();
  }

  private sync(): void {
    if (this.disposed) return;
    if (!this.env.wakeLock) return this.setStatus("unsupported");
    if (this.shouldHold()) return this.acquire();
    this.release();
    this.setStatus(!this.wanted ? "idle" : this.refused ? "refused" : "waiting");
  }

  private acquire(): void {
    if (this.sentinel && !this.sentinel.released) return this.setStatus("active");
    this.setStatus("requesting");
    // One request at a time: whatever it brings back is checked against what is wanted then.
    if (this.pending) return;
    this.pending = true;
    const generation = this.generation;
    this.env.wakeLock!.request("screen").then(
      (sentinel) => {
        this.pending = false;
        if (generation !== this.generation || !this.shouldHold()) {
          // No longer wanted by the time it arrived (paused, hidden, left the page).
          sentinel.release().catch(() => undefined);
          this.sync();
          return;
        }
        this.sentinel = sentinel;
        sentinel.addEventListener("release", () => {
          if (this.sentinel !== sentinel) return;
          // Let go by the system (or by us): asked for again only when something changes.
          this.sentinel = null;
          if (!this.disposed) this.setStatus(this.wanted ? "waiting" : "idle");
        });
        this.setStatus("active");
      },
      () => {
        this.pending = false;
        if (generation !== this.generation) return this.sync();
        this.refused = true;
        this.sync();
      },
    );
  }

  private release(): void {
    // Anything still on its way is released when it arrives.
    this.generation += 1;
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) sentinel.release().catch(() => undefined);
  }
}

/** The browser's own parts, or null on the server. */
export function browserWakeLockEnvironment(): WakeLockEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockEnvironment["wakeLock"] }).wakeLock;
  return {
    wakeLock: wakeLock && typeof wakeLock.request === "function" ? wakeLock : undefined,
    isVisible: () => document.visibilityState === "visible",
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

// ---------------------------------------------------------------------------
// The setting, remembered on this device
// ---------------------------------------------------------------------------

export const KEEP_AWAKE_KEY = "fwm:keep-screen-awake";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** On unless turned off here before. Storage may be unavailable (private browsing): then on. */
export function readKeepAwake(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(KEEP_AWAKE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeKeepAwake(storage: StorageLike | null, on: boolean): void {
  try {
    storage?.setItem(KEEP_AWAKE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; it still applies for this page.
  }
}
