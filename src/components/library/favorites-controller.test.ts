// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FavoritesController } from "./favorites-controller";

/** A server whose every answer the test releases by hand, in any order. */
interface Call {
  url: string;
  body: Record<string, unknown>;
  respond(status: number, data: unknown): void;
  fail(): void;
}

function harness(options: { timeoutMs?: number; staleMs?: number } = {}) {
  const calls: Call[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      respond: (status, data) => resolve(new Response(JSON.stringify(data), { status })),
      fail: () => reject(new TypeError("network")),
    });
  })) as unknown as typeof fetch;
  const channels: Array<{ name: string; postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; onmessage: ((event: MessageEvent) => void) | null }> = [];
  const controller = new FavoritesController("user_a", {
    fetcher,
    timeoutMs: options.timeoutMs ?? 1000,
    staleMs: options.staleMs ?? 5000,
    batchDelayMs: 10,
    channel: (name) => {
      const channel = { name, postMessage: vi.fn(), close: vi.fn(), onmessage: null };
      channels.push(channel);
      return channel as unknown as BroadcastChannel;
    },
  });
  const puts = () => calls.filter((call) => /favorites\/(?!membership)/.test(call.url));
  const reads = () => calls.filter((call) => call.url.endsWith("/membership"));
  return { calls, controller, channels, puts, reads, fetcher };
}

const tick = () => vi.advanceTimersByTimeAsync(0);
const flush = () => vi.advanceTimersByTimeAsync(11);
const ok = (favorite: boolean, songId = "S-1") => ({ ok: true, songId, favorite, changed: true });
const member = (favorited: boolean, songId = "S-1") => ({ state: favorited ? "favorited" : "not-favorited", songId });

async function loaded(favorited = false, options: { timeoutMs?: number; staleMs?: number } = {}) {
  const h = harness(options);
  h.controller.connect();
  h.controller.setVisible("S-1", true);
  await flush();
  h.reads()[0].respond(200, { ok: true, songs: { "S-1": member(favorited) } });
  await tick();
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("membership loading", () => {
  it("is unknown until the server answers, never presented as not saved", async () => {
    const h = harness();
    h.controller.connect();
    h.controller.setVisible("S-1", true);
    expect(h.controller.getView("S-1").status).toBe("loading");
    await flush();
    h.reads()[0].respond(200, { ok: true, songs: { "S-1": member(true) } });
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true });
  });

  it("batches many rows into bounded requests, never one per row", async () => {
    const h = harness();
    h.controller.connect();
    for (let i = 0; i < 450; i += 1) h.controller.setVisible(`S-${i}`, true);
    await flush();
    expect(h.reads()).toHaveLength(1);
    expect((h.reads()[0].body.ids as string[])).toHaveLength(200);
    h.reads()[0].respond(200, { ok: true, songs: {} });
    await tick();
    await flush();
    expect(h.reads()).toHaveLength(2);
    h.reads()[1].respond(200, { ok: true, songs: {} });
    await tick();
    await flush();
    expect(h.reads()).toHaveLength(3);
    expect((h.reads()[2].body.ids as string[])).toHaveLength(50);
  });

  it("marks unsupported identities and does not retry a failed read by itself", async () => {
    const h = harness();
    h.controller.connect();
    h.controller.setVisible("legacy-t-x", true);
    h.controller.setVisible("S-2", true);
    await flush();
    h.reads()[0].respond(200, { ok: true, songs: { "legacy-t-x": { state: "unsupported" }, "S-2": { state: "unavailable" } } });
    await tick();
    expect(h.controller.getView("legacy-t-x").status).toBe("unsupported");
    expect(h.controller.getView("S-2").status).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.reads()).toHaveLength(1);
  });

  it("blocks the account on an erasure refusal", async () => {
    const h = harness();
    h.controller.connect();
    h.controller.setVisible("S-1", true);
    await flush();
    h.reads()[0].respond(403, { ok: false, code: "account-erasing", error: "x" });
    await tick();
    expect(h.controller.getView("S-1").status).toBe("blocked");
  });

  it("does not let an older read overwrite a newer mutation", async () => {
    const h = await loaded(false);
    h.controller.invalidate();
    await flush();
    const staleRead = h.reads()[1];
    h.controller.setFavorite("S-1", true);
    await tick();
    h.puts()[0].respond(200, ok(true));
    await tick();
    staleRead.respond(200, { ok: true, songs: { "S-1": member(false) } });
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(true);
  });

  it("shares one state between controls using different spellings", async () => {
    const h = harness();
    h.controller.connect();
    h.controller.setVisible("S-1", true);
    h.controller.setVisible("catalog-old", true);
    await flush();
    h.reads()[0].respond(200, { ok: true, songs: { "S-1": member(false), "catalog-old": member(false) } });
    await tick();
    const heard = vi.fn();
    h.controller.subscribe("catalog-old", heard);
    h.controller.setFavorite("S-1", true);
    expect(h.controller.getView("catalog-old").favorited).toBe(true);
    expect(heard).toHaveBeenCalled();
    h.controller.setFavorite("catalog-old", false);
    await tick();
    expect(h.puts()).toHaveLength(1);
    expect(h.puts()[0].url).toContain("/S-1");
  });
});

describe("optimistic mutations", () => {
  it("shows the change at once and sends an explicit state with the account", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    expect(h.controller.getView("S-1")).toMatchObject({ favorited: true, pending: true });
    await tick();
    expect(h.puts()[0].body).toEqual({ favorite: true, expectedAccount: "user_a" });
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true, pending: false });
  });

  it("collapses rapid clicks to one request and the latest intent", async () => {
    const h = await loaded(false);
    for (const want of [true, false, true, false, true]) h.controller.setFavorite("S-1", want);
    await tick();
    expect(h.puts()).toHaveLength(1);
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.puts()).toHaveLength(1);
    expect(h.controller.getView("S-1")).toMatchObject({ favorited: true, pending: false });
  });

  it("sends the newer intent only after the first answer", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    h.controller.setFavorite("S-1", false);
    await tick();
    expect(h.puts()).toHaveLength(1);
    expect(h.controller.getView("S-1").favorited).toBe(false);
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(false);
    expect(h.puts()).toHaveLength(2);
    expect(h.puts()[1].body.favorite).toBe(false);
    h.puts()[1].respond(200, ok(false));
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ favorited: false, pending: false });
  });

  it("reverts and explains a definite refusal, without retrying", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    await tick();
    h.puts()[0].respond(422, { ok: false, code: "unsupported-song", error: "x" });
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: false, pending: false });
    expect(h.controller.getView("S-1").error).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.puts()).toHaveLength(1);
  });

  it("says so when offline and sends nothing", async () => {
    const h = await loaded(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    h.controller.setFavorite("S-1", true);
    await tick();
    expect(h.puts()).toHaveLength(0);
    expect(h.controller.getView("S-1")).toMatchObject({ favorited: false });
    expect(h.controller.getView("S-1").error).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe("uncertain outcomes", () => {
  async function uncertain(favorited = false, how: "timeout" | "network" | "server" = "network") {
    const h = await loaded(favorited);
    h.controller.setFavorite("S-1", !favorited);
    await tick();
    if (how === "timeout") await vi.advanceTimersByTimeAsync(1001);
    else if (how === "network") h.puts()[0].fail();
    else h.puts()[0].respond(503, { ok: false, code: "unavailable", error: "x" });
    await tick();
    return h;
  }
  const answerRead = async (h: ReturnType<typeof harness>, favorited: boolean) => {
    await flush();
    h.reads()[h.reads().length - 1].respond(200, { ok: true, songs: { "S-1": member(favorited) } });
    await tick();
  };

  it.each(["timeout", "network", "server"] as const)("treats a %s as uncertain, never as saved or failed", async (how) => {
    const h = await uncertain(false, how);
    expect(h.controller.getView("S-1")).toMatchObject({ status: "uncertain", intended: true, pending: false });
  });

  it("does not retry by itself, however long it waits", async () => {
    const h = await uncertain();
    await answerRead(h, false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.puts()).toHaveLength(1);
  });

  it("makes exactly one reconciliation read and no polling", async () => {
    const h = await uncertain();
    const before = h.reads().length;
    await answerRead(h, false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.reads().length).toBe(before + 1);
  });

  it.each([true, false])("keeps it uncertain after a read that says %s", async (seen) => {
    const h = await uncertain();
    await answerRead(h, seen);
    expect(h.controller.getView("S-1")).toMatchObject({ status: "uncertain", observed: seen, favorited: seen });
  });

  it.each([
    ["same direction", true],
    ["opposing", false],
  ])("sends nothing for an ordinary %s click while uncertain", async (_name, want) => {
    const h = await uncertain();
    await answerRead(h, false);
    h.controller.setFavorite("S-1", want);
    await tick();
    expect(h.puts()).toHaveLength(1);
    expect(h.controller.getView("S-1").status).toBe("uncertain");
  });

  it("ends when the original request finally gets a definite answer", async () => {
    const h = await uncertain(false, "timeout");
    await answerRead(h, false);
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true });
  });

  it("ends when the original request is definitely refused", async () => {
    const h = await uncertain(false, "timeout");
    h.puts()[0].respond(422, { ok: false, code: "unsupported-song", error: "x" });
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: false });
    expect(h.controller.getView("S-1").error).toBeTruthy();
  });

  it("stays uncertain if the original request then fails on the network", async () => {
    const h = await uncertain(false, "timeout");
    h.puts()[0].fail();
    await tick();
    expect(h.controller.getView("S-1").status).toBe("uncertain");
    expect(h.puts()).toHaveLength(1);
  });

  it("sends exactly one request for an explicit choice", async () => {
    const h = await uncertain();
    await answerRead(h, false);
    h.controller.retryUncertain("S-1", true);
    await tick();
    expect(h.puts()).toHaveLength(2);
    expect(h.puts()[1].body.favorite).toBe(true);
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true, pending: true });
    h.puts()[1].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true, pending: false });
  });

  it("allows an explicit opposing choice, even matching what was last seen", async () => {
    const h = await uncertain();
    await answerRead(h, false);
    h.controller.retryUncertain("S-1", false);
    await tick();
    expect(h.puts()).toHaveLength(2);
    expect(h.puts()[1].body.favorite).toBe(false);
  });

  it("returns to uncertain if the explicit request is lost too", async () => {
    const h = await uncertain();
    await answerRead(h, false);
    h.controller.retryUncertain("S-1", true);
    await tick();
    h.puts()[1].fail();
    await tick();
    expect(h.controller.getView("S-1")).toMatchObject({ status: "uncertain", intended: true });
    expect(h.puts()).toHaveLength(2);
  });

  it("reads again when the original lands after the explicit choice, and shows the server's truth", async () => {
    const h = await uncertain(false, "timeout");
    await answerRead(h, false);
    h.controller.retryUncertain("S-1", false);
    await tick();
    h.puts()[1].respond(200, ok(false));
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(false);
    const readsBefore = h.reads().length;

    // The first request (add) was still travelling and landed last on the server.
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(false);
    await answerRead(h, true);
    expect(h.reads().length).toBe(readsBefore + 1);
    expect(h.controller.getView("S-1")).toMatchObject({ status: "ready", favorited: true });
  });

  it("forces a fresh read on next focus while an earlier request is unanswered", async () => {
    const h = await uncertain(false, "timeout");
    await answerRead(h, false);
    h.controller.retryUncertain("S-1", true);
    await tick();
    h.puts()[1].respond(200, ok(true));
    await tick();
    const before = h.reads().length;
    h.controller.refreshIfStale();
    await flush();
    expect(h.reads().length).toBe(before + 1);
  });

  it("ignores a late answer after the account changed", async () => {
    const h = await uncertain(false, "timeout");
    h.controller.disconnect();
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(false);
  });
});

describe("refresh and other tabs", () => {
  it("broadcasts only a signal, with no song data, on the account's channel", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    await tick();
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(h.channels[0].name).toBe("favorites:user_a");
    expect(h.channels[0].postMessage.mock.calls).toEqual([["changed"]]);
  });

  it("re-reads what is on screen when another tab signals, and flags the collection", async () => {
    const h = await loaded(false);
    h.channels[0].onmessage?.({} as MessageEvent);
    expect(h.controller.getCollectionVersion()).toBe(1);
    await flush();
    expect(h.reads()).toHaveLength(2);
    h.reads()[1].respond(200, { ok: true, songs: { "S-1": member(true) } });
    await tick();
    expect(h.controller.getView("S-1").favorited).toBe(true);
  });

  it("coalesces repeated signals into one read", async () => {
    const h = await loaded(false);
    for (let i = 0; i < 5; i += 1) h.channels[0].onmessage?.({} as MessageEvent);
    await flush();
    expect(h.reads()).toHaveLength(2);
  });

  it("works without BroadcastChannel", async () => {
    const controller = new FavoritesController("user_a", { fetcher: vi.fn() as unknown as typeof fetch, channel: () => null });
    expect(() => controller.connect()).not.toThrow();
    controller.disconnect();
  });

  it("refreshes on focus only when stale", async () => {
    const h = await loaded(false);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(h.reads()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5001);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(h.reads()).toHaveLength(2);
  });

  it("refreshes on navigation after a local change", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    await tick();
    h.puts()[0].respond(200, ok(true));
    await tick();
    h.controller.refreshIfStale();
    expect(h.controller.getCollectionVersion()).toBe(1);
    await flush();
    expect(h.reads()).toHaveLength(2);
  });

  it("does not poll", async () => {
    const h = await loaded(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.reads()).toHaveLength(1);
  });

  it("reads a row again when it returns to the screen after a refresh", async () => {
    const h = await loaded(false);
    h.controller.setVisible("S-1", false);
    h.controller.invalidate();
    await flush();
    expect(h.reads()).toHaveLength(1);
    h.controller.setVisible("S-1", true);
    await flush();
    expect(h.reads()).toHaveLength(2);
  });
});

describe("account changes", () => {
  it("drops queued intent and sends nothing more for the old account", async () => {
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    h.controller.setFavorite("S-1", false);
    await tick();
    h.controller.disconnect();
    h.puts()[0].respond(200, ok(true));
    await tick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.puts()).toHaveLength(1);
    expect(h.channels[0].close).toHaveBeenCalled();
  });

  it("drops a queued read and ignores one already travelling", async () => {
    const h = harness();
    h.controller.connect();
    h.controller.setVisible("S-1", true);
    await flush();
    const read = h.reads()[0];
    h.controller.setVisible("S-2", true);
    h.controller.disconnect();
    read.respond(200, { ok: true, songs: { "S-1": member(true) } });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.controller.getView("S-1").status).toBe("loading");
    expect(h.reads()).toHaveLength(1);
  });

  it("refuses new changes once disconnected", async () => {
    const h = await loaded(false);
    h.controller.disconnect();
    h.controller.setFavorite("S-1", true);
    await tick();
    expect(h.puts()).toHaveLength(0);
  });

  it("keeps two accounts' controllers entirely separate", async () => {
    const a = await loaded(true);
    const b = new FavoritesController("user_b", { fetcher: vi.fn() as unknown as typeof fetch, channel: () => null });
    expect(a.controller.getView("S-1").favorited).toBe(true);
    expect(b.getView("S-1").status).toBe("loading");
  });

  it("stores nothing in the browser", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const h = await loaded(false);
    h.controller.setFavorite("S-1", true);
    await tick();
    h.puts()[0].respond(200, ok(true));
    await tick();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("removing an unavailable entry", () => {
  it("sends the exact key, and reports the result", async () => {
    const h = await loaded(false);
    const result = h.controller.removeEntry("GONE-1");
    await tick();
    expect(h.puts()[0].url).toContain("/GONE-1");
    expect(h.puts()[0].body).toEqual({ favorite: false, exact: true, expectedAccount: "user_a" });
    h.puts()[0].respond(200, { ok: true, songId: "GONE-1", favorite: false, changed: true });
    await expect(result).resolves.toBe("removed");
  });

  it("reports a lost response as uncertain, not as removed", async () => {
    const h = await loaded(false);
    const result = h.controller.removeEntry("GONE-1");
    await tick();
    h.puts()[0].fail();
    await expect(result).resolves.toBe("uncertain");
  });

  it("does not send a second overlapping removal", async () => {
    const h = await loaded(false);
    const first = h.controller.removeEntry("GONE-1");
    await expect(h.controller.removeEntry("GONE-1")).resolves.toBe("failed");
    await tick();
    expect(h.puts()).toHaveLength(1);
    h.puts()[0].respond(200, { ok: true, songId: "GONE-1", favorite: false, changed: false });
    await first;
  });
});
