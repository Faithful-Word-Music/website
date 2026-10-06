import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPushPayload, type PushMessage } from "./push";

/**
 * The service worker itself: public/sw.js, the very file browsers are served,
 * run here against a pretend browser. It cannot import the site's code, so
 * this is what holds its checks to the same rules as push.ts.
 */
const SOURCE = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8");

interface FakeWindow {
  focused: boolean;
  visibilityState: "visible" | "hidden";
  messages: unknown[];
  /** Whether the page answers a tap handed to it. */
  answers: boolean;
  focus: () => Promise<FakeWindow>;
  postMessage: (message: unknown, transfer?: Array<{ postMessage(message: unknown): void }>) => void;
}

function page(extra: Partial<Pick<FakeWindow, "focused" | "visibilityState" | "answers">> = {}): FakeWindow {
  const self: FakeWindow = {
    focused: false,
    visibilityState: "hidden",
    answers: true,
    messages: [],
    ...extra,
    focus: vi.fn(async () => self),
    postMessage: (message, transfer) => {
      self.messages.push(message);
      if (self.answers) transfer?.[0]?.postMessage({ ok: true });
    },
  };
  return self;
}

function worker(options: { pages?: FakeWindow[]; badge?: boolean } = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: Array<{ title: string; options: { body: string; tag: string; renotify: boolean; icon: string; data: { id: number | null; url: string } } }> = [];
  const opened: string[] = [];
  const badge: Array<number | "clear"> = [];
  const pages = options.pages ?? [];

  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: {
      showNotification: async (title: string, shownOptions: (typeof shown)[number]["options"]) => {
        shown.push({ title, options: shownOptions });
      },
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: async () => pages,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
    navigator:
      options.badge === false
        ? {}
        : {
            setAppBadge: async (count: number) => void badge.push(count),
            clearAppBadge: async () => void badge.push("clear"),
          },
  };

  // The worker's own MessageChannel: the two ports talk to each other directly.
  class Channel {
    port1: { onmessage: ((event: unknown) => void) | null } = { onmessage: null };
    port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
  }

  vm.runInNewContext(SOURCE, { self, MessageChannel: Channel, setTimeout: (task: () => void, ms: number) => setTimeout(task, ms), Promise });

  /** Fires an event and waits for everything the worker asked the browser to wait for. */
  async function fire(type: string, event: Record<string, unknown> = {}) {
    const waiting: Array<Promise<unknown>> = [];
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => waiting.push(promise) });
    await Promise.all(waiting);
  }

  const push = (data: unknown) => fire("push", { data: data === undefined ? null : { json: () => (typeof data === "function" ? data() : data) } });
  const tap = (data: unknown) => {
    const notification = { data, close: vi.fn() };
    return { notification, done: fire("notificationclick", { notification }) };
  };

  return { listeners, shown, opened, badge, push, tap, fire, self };
}

const message = (extra: Partial<PushMessage> = {}): PushMessage => ({
  notificationId: 41,
  eventId: 7,
  userId: "user_john",
  title: "Sunday Morning song list updated",
  body: "Psalm 120 was removed.",
  actionUrl: "/song-list",
  priority: "normal",
  tag: "service_plan.change|service:2026-10-11-am",
  folds: true,
  ...extra,
});

afterEach(() => vi.useRealTimers());

describe("the service worker", () => {
  it("does push and nothing else: it never handles a page load", () => {
    const { listeners } = worker();
    expect([...listeners.keys()].sort()).toEqual(["activate", "install", "notificationclick", "push", "pushsubscriptionchange"]);
    expect(SOURCE).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(SOURCE).not.toMatch(/caches\./);
  });

  it("takes over at once, since it holds nothing an old version must finish with", async () => {
    const { fire, self } = worker();
    await fire("install");
    await fire("activate");
    expect(self.skipWaiting).toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalled();
  });
});

describe("a push arriving", () => {
  it("shows what the server sent, under its tag, and quietly when it replaces another", async () => {
    const { push, shown } = worker();
    await push(buildPushPayload(message(), 3));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Sunday Morning song list updated");
    expect(shown[0].options).toMatchObject({
      body: "Psalm 120 was removed.",
      tag: "service_plan.change|service:2026-10-11-am",
      renotify: false,
      icon: "/app-icon/192",
      data: { id: 41, url: "/song-list" },
    });
  });

  it("sets the app icon to the unread count, and clears it at zero", async () => {
    const { push, badge } = worker();
    await push(buildPushPayload(message(), 3));
    await push(buildPushPayload(message(), 0));
    expect(badge).toEqual([3, "clear"]);
  });

  it("does nothing about an icon where icons cannot be badged, and still shows the notification", async () => {
    const { push, shown } = worker({ badge: false });
    await expect(push(buildPushPayload(message(), 3))).resolves.toBeUndefined();
    expect(shown).toHaveLength(1);
  });

  it("tells every open page, so each refreshes its own notifications", async () => {
    const pages = [page(), page()];
    const { push } = worker({ pages });
    await push(buildPushPayload(message(), 1));
    for (const open of pages) expect(open.messages).toEqual([{ type: "fwm:push" }]);
  });

  it("always shows something: a push it cannot read says there is news, and leaves the icon alone", async () => {
    const good = buildPushPayload(message(), 1);
    const unreadable: unknown[] = [
      undefined,
      "hello",
      () => {
        throw new Error("not JSON");
      },
      { ...good, v: 2 },
      { ...good, id: "41" },
      { ...good, title: "" },
      { ...good, title: "x".repeat(121) },
      { ...good, url: "https://elsewhere.example/" },
      { ...good, url: "//elsewhere.example" },
      { ...good, url: "javascript:alert(1)" },
      { ...good, tag: "" },
    ];
    for (const data of unreadable) {
      const { push, shown, badge } = worker();
      await push(data);
      expect(shown).toHaveLength(1);
      expect(shown[0].title).toBe("Faithful Word Music");
      expect(shown[0].options.data).toEqual({ id: null, url: "/notifications" });
      expect(badge).toEqual([]);
    }
  });
});

describe("a push being tapped", () => {
  it("closes it, and with the site closed opens the page that marks it read", async () => {
    const { tap, opened } = worker();
    const { notification, done } = tap({ id: 41, url: "/song-list" });
    await done;
    expect(notification.close).toHaveBeenCalled();
    expect(opened).toEqual(["/notifications/open/41"]);
  });

  it("brings an open page forward and hands it the tap, opening nothing new", async () => {
    const behind = page();
    const front = page({ focused: true, visibilityState: "visible" });
    const { tap, opened } = worker({ pages: [behind, front] });
    await tap({ id: 41, url: "/song-list" }).done;
    expect(front.focus).toHaveBeenCalled();
    expect(front.messages).toEqual([{ type: "fwm:push-click", id: 41, url: "/song-list" }]);
    expect(behind.messages).toEqual([]);
    expect(opened).toEqual([]);
  });

  it("prefers a page in view to one that is not, when none is being looked at", async () => {
    const hidden = page();
    const visible = page({ visibilityState: "visible" });
    const { tap } = worker({ pages: [hidden, visible] });
    await tap({ id: 41, url: "/song-list" }).done;
    expect(visible.messages).toHaveLength(1);
    expect(hidden.messages).toEqual([]);
  });

  it("opens the site afresh when the open page does not answer", async () => {
    vi.useFakeTimers();
    const silent = page({ answers: false });
    const { tap, opened } = worker({ pages: [silent] });
    const { done } = tap({ id: 41, url: "/song-list" });
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    expect(opened).toEqual(["/notifications/open/41"]);
  });

  it("never opens or hands over an address off the site", async () => {
    for (const url of ["https://elsewhere.example/", "//elsewhere.example", "/\\elsewhere.example", "javascript:alert(1)", 7, undefined]) {
      const closed = worker();
      await closed.tap({ id: null, url }).done;
      expect(closed.opened).toEqual(["/notifications"]);

      const open = page({ focused: true });
      await worker({ pages: [open] }).tap({ id: 41, url }).done;
      expect(open.messages).toEqual([{ type: "fwm:push-click", id: 41, url: "/notifications" }]);
    }
  });

  it("opens only a real notification's page, whatever its data claims", async () => {
    for (const id of ["41/../../admin", -1, 1.5, null, "41"]) {
      const { tap, opened } = worker();
      await tap({ id, url: "/song-list" }).done;
      expect(opened).toEqual(["/song-list"]);
    }
  });
});

describe("the browser replacing a subscription", () => {
  it("is passed to the open pages, which have a session to register the new one with", async () => {
    const open = page();
    const { fire } = worker({ pages: [open] });
    await fire("pushsubscriptionchange");
    expect(open.messages).toEqual([{ type: "fwm:push-subscription" }]);
  });
});
