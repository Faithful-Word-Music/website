import { favoritesContent } from "@/content/favorites";
import {
  MAX_MEMBERSHIP_IDS,
  type FavoriteErrorBody,
  type FavoriteErrorCode,
  type FavoriteMutationBody,
  type MembershipState,
} from "@/lib/favorites-api";

/**
 * One account's Favorites in this tab. Memory only, and one instance per
 * account: on an account change the old instance is disconnected and dropped.
 *
 * The server's order is the truth. This keeps a tab honest about it:
 *   - One request at a time per song. Later clicks collapse into the latest intent.
 *   - An older answer never overwrites a newer intent (`touched`).
 *   - A request with no definite answer makes the song UNCERTAIN, because it
 *     may still complete on the server, even after a read says otherwise.
 *
 * While a song is uncertain:
 *   - A read updates what was last OBSERVED and never clears the uncertainty.
 *   - An ordinary click sends nothing. Nothing is retried automatically.
 *   - Only the member's explicit choice (retryUncertain) sends one request.
 *   - The uncertainty ends when the original request gets a definite answer,
 *     or when that explicit request does. If the original then answers late,
 *     the song is read again, since it may have landed after the choice.
 */

export type FavoriteStatus = "loading" | "ready" | "uncertain" | "unsupported" | "unavailable" | "blocked";

export interface FavoriteView {
  status: FavoriteStatus;
  /** What to show. While uncertain, the last observed state, which is not a confirmed save. */
  favorited: boolean;
  pending: boolean;
  /** While uncertain: what the last read saw (null if none has answered). */
  observed: boolean | null;
  /** While uncertain: what the member last asked for. */
  intended: boolean | null;
  error: string | null;
}

interface SongRecord {
  songId: string;
  confirmed: boolean | null;
  desired: boolean | null;
  sending: boolean;
  activeToken: number;
  /** Every request not yet answered, including ones given up on as uncertain. */
  open: Set<number>;
  uncertain: boolean;
  observed: boolean | null;
  intended: boolean | null;
  error: string | null;
  /** When this song last changed locally; a read begun before this is out of date. */
  touched: number;
  timer: ReturnType<typeof setTimeout> | null;
}

type Outcome =
  | { kind: "ok"; favorite: boolean }
  | { kind: "refused"; code: FavoriteErrorCode }
  | { kind: "lost" };

export interface ControllerOptions {
  fetcher?: typeof fetch;
  channel?: (name: string) => Pick<BroadcastChannel, "postMessage" | "close" | "onmessage"> | null;
  timeoutMs?: number;
  staleMs?: number;
  batchDelayMs?: number;
  now?: () => number;
}

const BLOCKING: readonly FavoriteErrorCode[] = ["unauthorized", "profile-blocked", "account-erasing"];
const LOADING: FavoriteView = { status: "loading", favorited: false, pending: false, observed: null, intended: null, error: null };

function browserChannel(name: string) {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(name);
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export class FavoritesController {
  private readonly fetcher: typeof fetch;
  private readonly openChannel: NonNullable<ControllerOptions["channel"]>;
  private readonly timeoutMs: number;
  private readonly staleMs: number;
  private readonly batchDelayMs: number;
  private readonly now: () => number;

  private connected = false;
  /** Changes on every disconnect, so nothing started earlier can touch state. */
  private epoch = 0;
  private seq = 0;
  private tokens = 0;
  private blocked = false;
  private dirty = false;
  private lastReadAt = 0;

  private readonly songs = new Map<string, SongRecord>();
  private readonly canonical = new Map<string, string>();
  private readonly idStates = new Map<string, "unsupported" | "unavailable">();
  private readonly visible = new Set<string>();
  private readonly fresh = new Set<string>();
  private readonly queue = new Set<string>();
  private readonly removing = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly views = new Map<string, FavoriteView>();
  private readonly collectionListeners = new Set<() => void>();
  private collectionVersion = 0;

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reading: AbortController | null = null;
  private channel: Pick<BroadcastChannel, "postMessage" | "close" | "onmessage"> | null = null;

  constructor(readonly accountId: string, options: ControllerOptions = {}) {
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.openChannel = options.channel ?? browserChannel;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.staleMs = options.staleMs ?? 30_000;
    this.batchDelayMs = options.batchDelayMs ?? 60;
    this.now = options.now ?? Date.now;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    this.lastReadAt = this.now();
    this.channel = this.openChannel(`favorites:${this.accountId}`);
    // A signal only: no song, title or list ever crosses between tabs.
    if (this.channel) this.channel.onmessage = () => this.invalidate();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", this.onFocus);
      document.addEventListener("visibilitychange", this.onFocus);
    }
    for (const id of this.visible) if (!this.fresh.has(id)) this.queue.add(id);
    this.scheduleFlush();
  }

  /** Stops everything: queued intents are dropped and late answers are ignored. */
  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.epoch += 1;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.reading?.abort();
    this.reading = null;
    this.queue.clear();
    this.channel?.close();
    this.channel = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this.onFocus);
      document.removeEventListener("visibilitychange", this.onFocus);
    }
    for (const record of this.songs.values()) {
      if (record.timer) clearTimeout(record.timer);
      record.timer = null;
      record.desired = null;
      record.sending = false;
      record.open.clear();
    }
  }

  private readonly onFocus = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.refreshIfStale();
  };

  // -------------------------------------------------------------------------
  // Reading state
  // -------------------------------------------------------------------------

  subscribe = (id: string, listener: () => void): (() => void) => {
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
    };
  };

  subscribeCollection = (listener: () => void): (() => void) => {
    this.collectionListeners.add(listener);
    return () => this.collectionListeners.delete(listener);
  };

  /** Rises when the collection should be read again from the server. */
  getCollectionVersion = (): number => this.collectionVersion;

  getView = (id: string): FavoriteView => {
    const next = this.computeView(id);
    const previous = this.views.get(id);
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return previous;
    this.views.set(id, next);
    return next;
  };

  private computeView(id: string): FavoriteView {
    if (this.blocked) return { ...LOADING, status: "blocked" };
    const songId = this.canonical.get(id);
    const record = songId ? this.songs.get(songId) : undefined;
    if (!record || record.confirmed === null) {
      const state = this.idStates.get(id);
      return state ? { ...LOADING, status: state } : LOADING;
    }
    if (record.uncertain) {
      return {
        status: "uncertain",
        favorited: record.observed ?? record.confirmed,
        pending: false,
        observed: record.observed,
        intended: record.intended,
        error: null,
      };
    }
    return {
      status: "ready",
      favorited: record.desired ?? record.confirmed,
      pending: record.sending || record.desired !== null,
      observed: null,
      intended: null,
      error: record.error,
    };
  }

  private notify(id: string): void {
    this.listeners.get(id)?.forEach((listener) => listener());
  }

  private notifySong(songId: string): void {
    this.notify(songId);
    for (const [id, canonical] of this.canonical) if (canonical === songId && id !== songId) this.notify(id);
  }

  private notifyAll(): void {
    for (const id of [...this.listeners.keys()]) this.notify(id);
  }

  private record(songId: string): SongRecord {
    let record = this.songs.get(songId);
    if (!record) {
      record = {
        songId, confirmed: null, desired: null, sending: false, activeToken: 0, open: new Set(),
        uncertain: false, observed: null, intended: null, error: null, touched: 0, timer: null,
      };
      this.songs.set(songId, record);
    }
    this.canonical.set(songId, songId);
    return record;
  }

  // -------------------------------------------------------------------------
  // Membership reads, in bounded batches
  // -------------------------------------------------------------------------

  setVisible(id: string, visible: boolean): void {
    if (!visible) {
      this.visible.delete(id);
      return;
    }
    this.visible.add(id);
    if (!this.fresh.has(id)) {
      this.queue.add(id);
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (!this.connected || this.flushTimer || this.reading || this.queue.size === 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.batchDelayMs);
  }

  private async flush(): Promise<void> {
    if (!this.connected || this.reading || this.blocked) return;
    const ids = [...this.queue].slice(0, MAX_MEMBERSHIP_IDS);
    if (ids.length === 0) return;
    for (const id of ids) this.queue.delete(id);

    const epoch = this.epoch;
    const startedAt = this.seq;
    const abort = new AbortController();
    this.reading = abort;
    try {
      const response = await this.fetcher("/api/account/favorites/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids }),
        signal: abort.signal,
      });
      const body = (await response.json().catch(() => null)) as { songs?: Record<string, MembershipState> } | FavoriteErrorBody | null;
      if (epoch !== this.epoch) return;
      if (response.ok && body && "songs" in body && body.songs) {
        this.lastReadAt = this.now();
        for (const id of ids) this.applyMembership(id, body.songs[id], startedAt);
      } else if (body && "code" in body && BLOCKING.includes(body.code)) {
        this.setBlocked();
      } else {
        this.markUnread(ids);
      }
    } catch {
      if (epoch === this.epoch) this.markUnread(ids);
    } finally {
      if (epoch === this.epoch) {
        this.reading = null;
        this.scheduleFlush();
      }
    }
  }

  /** Not read: anything already known stays, and nothing is retried until the next refresh. */
  private markUnread(ids: readonly string[]): void {
    for (const id of ids) {
      if (!this.canonical.has(id)) this.idStates.set(id, "unavailable");
      this.notify(id);
    }
  }

  private applyMembership(id: string, state: MembershipState | undefined, startedAt: number): void {
    if (!state || state.state === "unavailable") {
      this.markUnread([id]);
      return;
    }
    if (state.state === "unsupported") {
      this.idStates.set(id, "unsupported");
      this.fresh.add(id);
      this.notify(id);
      return;
    }
    this.idStates.delete(id);
    this.fresh.add(id);
    const record = this.record(state.songId);
    this.canonical.set(id, state.songId);
    const value = state.state === "favorited";
    if (record.touched <= startedAt) {
      if (record.uncertain) record.observed = value;
      else if (!record.sending && record.desired === null) record.confirmed = value;
    }
    // A control may have learned its identity only now, with a record already in flight.
    if (record.confirmed === null) record.confirmed = value;
    this.notifySong(state.songId);
    this.notify(id);
  }

  private setBlocked(): void {
    this.blocked = true;
    this.queue.clear();
    for (const record of this.songs.values()) record.desired = null;
    this.notifyAll();
  }

  /** The current position in local changes, for seed(). */
  beginRead(): number {
    return this.seq;
  }

  /** Songs a collection read just listed, so their hearts need no membership request. */
  seed(songIds: readonly string[], startedAt: number): void {
    if (!this.connected) return;
    for (const songId of songIds) {
      const record = this.record(songId);
      if (record.touched <= startedAt && !record.sending && record.desired === null && !record.uncertain) record.confirmed = true;
      this.idStates.delete(songId);
      this.fresh.add(songId);
      this.notifySong(songId);
    }
  }

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  /** Another tab changed something, or an explicit refresh: read again what is on screen. */
  invalidate = (): void => {
    if (!this.connected) return;
    this.dirty = false;
    this.lastReadAt = this.now();
    this.fresh.clear();
    for (const id of this.visible) this.queue.add(id);
    this.scheduleFlush();
    this.collectionVersion += 1;
    this.collectionListeners.forEach((listener) => listener());
  };

  /** On focus and navigation. Does nothing unless something is out of date. */
  refreshIfStale = (): void => {
    if (!this.connected || this.blocked) return;
    if (!this.dirty && this.now() - this.lastReadAt < this.staleMs) return;
    this.invalidate();
  };

  private changed(): void {
    this.dirty = true;
    try {
      this.channel?.postMessage("changed");
    } catch {
      // Best effort. Other tabs still catch up on focus.
    }
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /** An ordinary click: the song's desired state. Refused while its last request is uncertain. */
  setFavorite(id: string, want: boolean): void {
    const songId = this.canonical.get(id);
    const record = songId ? this.songs.get(songId) : undefined;
    if (!record || !this.connected || this.blocked || record.confirmed === null || record.uncertain) return;
    if (isOffline()) {
      record.error = favoritesContent.offline;
      this.notifySong(record.songId);
      return;
    }
    record.error = null;
    record.desired = want;
    record.touched = ++this.seq;
    this.notifySong(record.songId);
    this.pump(record);
  }

  /**
   * The member's explicit choice for an uncertain song: one request. A success
   * is what that request did. An earlier request could still land after it,
   * so the song is read again on the next focus or navigation.
   */
  retryUncertain(id: string, want: boolean): void {
    const songId = this.canonical.get(id);
    const record = songId ? this.songs.get(songId) : undefined;
    if (!record || !this.connected || this.blocked || !record.uncertain || record.sending) return;
    if (isOffline()) return;
    record.uncertain = false;
    record.confirmed = record.observed ?? record.confirmed;
    record.observed = null;
    record.intended = null;
    record.error = null;
    record.desired = want;
    this.send(record, want);
    this.notifySong(record.songId);
  }

  clearError(id: string): void {
    const songId = this.canonical.get(id);
    const record = songId ? this.songs.get(songId) : undefined;
    if (!record?.error) return;
    record.error = null;
    this.notifySong(record.songId);
  }

  private pump(record: SongRecord): void {
    if (!this.connected || record.sending || record.uncertain || record.desired === null) return;
    if (record.desired === record.confirmed) {
      record.desired = null;
      this.notifySong(record.songId);
      return;
    }
    this.send(record, record.desired);
  }

  private send(record: SongRecord, want: boolean): void {
    const token = ++this.tokens;
    const epoch = this.epoch;
    record.activeToken = token;
    record.sending = true;
    record.touched = ++this.seq;
    record.open.add(token);
    if (record.timer) clearTimeout(record.timer);
    record.timer = setTimeout(() => this.onTimeout(record, token, want), this.timeoutMs);
    void this.put(record.songId, { favorite: want, expectedAccount: this.accountId }).then((outcome) =>
      this.settle(record, token, want, epoch, outcome));
  }

  private async put(songId: string, body: Record<string, unknown>): Promise<Outcome> {
    try {
      const response = await this.fetcher(`/api/account/favorites/${encodeURIComponent(songId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as FavoriteMutationBody | FavoriteErrorBody | null;
      if (response.ok && data?.ok === true) return { kind: "ok", favorite: data.favorite };
      if (data && data.ok === false) {
        // A generic server failure may have happened after the write. Every other code is a refusal before it.
        return data.code === "unavailable" ? { kind: "lost" } : { kind: "refused", code: data.code };
      }
      return { kind: "lost" };
    } catch {
      return { kind: "lost" };
    }
  }

  private onTimeout(record: SongRecord, token: number, want: boolean): void {
    if (token !== record.activeToken || !record.sending) return;
    record.sending = false;
    record.timer = null;
    this.markUncertain(record, want);
  }

  private markUncertain(record: SongRecord, want: boolean): void {
    record.intended = record.desired ?? want;
    record.desired = null;
    record.uncertain = true;
    record.observed = null;
    record.error = null;
    record.touched = ++this.seq;
    this.notifySong(record.songId);
    this.readAgain(record);
  }

  /** One authoritative read of this song. */
  private readAgain(record: SongRecord): void {
    this.fresh.delete(record.songId);
    this.queue.add(record.songId);
    this.scheduleFlush();
  }

  private settle(record: SongRecord, token: number, want: boolean, epoch: number, outcome: Outcome): void {
    if (epoch !== this.epoch) return;
    record.open.delete(token);

    // An earlier request answering after the member's explicit choice: it may
    // have landed after that choice, so ask the server what is true now.
    if (token !== record.activeToken) {
      if (outcome.kind === "ok") {
        record.touched = ++this.seq;
        this.readAgain(record);
      }
      return;
    }

    const wasUncertain = record.uncertain;
    if (record.timer) clearTimeout(record.timer);
    record.timer = null;
    record.sending = false;

    if (outcome.kind === "lost") {
      if (wasUncertain) return;
      this.markUncertain(record, want);
      return;
    }

    record.touched = ++this.seq;
    record.uncertain = false;
    record.observed = null;
    record.intended = null;

    if (outcome.kind === "refused") {
      record.desired = null;
      if (BLOCKING.includes(outcome.code)) {
        this.setBlocked();
        return;
      }
      record.error = favoritesContent.errors[outcome.code];
      this.notifySong(record.songId);
      return;
    }

    record.confirmed = outcome.favorite;
    record.error = null;
    this.changed();
    // A request still unanswered could yet land, so the next refresh must not be skipped.
    if (record.open.size > 0) this.lastReadAt = 0;
    if (wasUncertain) record.desired = null;
    if (record.desired === record.confirmed) record.desired = null;
    this.notifySong(record.songId);
    this.pump(record);
  }

  /**
   * Removes one stored entry the Library cannot resolve, by its exact key.
   * Resolves to what is known: `uncertain` means read the list again.
   */
  async removeEntry(key: string): Promise<"removed" | "failed" | "uncertain"> {
    if (!this.connected || this.blocked || this.removing.has(key)) return "failed";
    if (isOffline()) return "failed";
    const epoch = this.epoch;
    this.removing.add(key);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        this.put(key, { favorite: false, exact: true, expectedAccount: this.accountId }),
        new Promise<Outcome>((resolve) => { timer = setTimeout(() => resolve({ kind: "lost" }), this.timeoutMs); }),
      ]);
      if (epoch !== this.epoch) return "failed";
      if (outcome.kind === "ok") {
        this.changed();
        return "removed";
      }
      if (outcome.kind === "refused" && BLOCKING.includes(outcome.code)) this.setBlocked();
      return outcome.kind === "lost" ? "uncertain" : "failed";
    } finally {
      clearTimeout(timer);
      this.removing.delete(key);
    }
  }
}
