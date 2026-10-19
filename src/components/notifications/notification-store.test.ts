import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FRESH_MS,
  IDLE_MS,
  hydrateNotifications,
  noteActivity,
  notificationSnapshot,
  openUnreadChannel,
  openedFromPush,
  pollUnread,
  receiveUnread,
  refreshNotifications,
  refreshUnread,
  setNotificationUser,
} from "./notification-store";

/** How often the bell asks for its count (src/components/notifications/notification-store.ts). */

const fetchMock = vi.fn();
const unreadCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/unread")).length;
const listCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("?limit=")).length;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const answer = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => answer({ ok: true, unread: 3 }));
  vi.stubGlobal("fetch", fetchMock);
  setNotificationUser(null);
  setNotificationUser("user_1");
  noteActivity();
  fetchMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("refreshUnread", () => {
  it("asks once for two routine reasons at the same moment", async () => {
    await Promise.all([refreshUnread({ ifStale: true }), refreshUnread({ ifStale: true })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks nothing routine while the count is fresh, and again once it is not", async () => {
    await refreshUnread({ ifStale: true });
    await refreshUnread({ ifStale: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FRESH_MS + 1);
    await refreshUnread({ ifStale: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("always asks when something has just changed", async () => {
    await refreshUnread({ ifStale: true });
    await refreshUnread();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks nothing when signed out", async () => {
    setNotificationUser(null);
    await refreshUnread();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts fresh for the next person", async () => {
    await refreshUnread({ ifStale: true });
    setNotificationUser("user_2");
    await refreshUnread({ ifStale: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a newer count that arrived while its own request was on its way", async () => {
    const slow = deferred<ReturnType<typeof answer>>();
    fetchMock.mockImplementationOnce(() => slow.promise);
    const asking = refreshUnread();
    vi.advanceTimersByTime(10);
    receiveUnread({ userId: "user_1", unread: 7, at: Date.now() });
    slow.resolve(answer({ ok: true, unread: 2 }));
    await asking;
    expect(notificationSnapshot().unread).toBe(7);
  });
});

describe("the poll", () => {
  it("asks while the tab is in view and someone is using it", () => {
    pollUnread();
    expect(unreadCalls()).toBe(1);
  });

  it("asks nothing once nobody has used the tab for a while", () => {
    vi.advanceTimersByTime(IDLE_MS);
    pollUnread();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never holds back a push: an idle tab still asks at once when one arrives", async () => {
    await refreshUnread();
    vi.advanceTimersByTime(IDLE_MS);
    await refreshNotifications();
    expect(unreadCalls()).toBe(2);
  });

  it("asks nothing while the tab is hidden", () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    pollUnread();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks at once when someone comes back after an idle spell, then not again for ordinary activity", () => {
    vi.advanceTimersByTime(IDLE_MS);
    noteActivity();
    expect(unreadCalls()).toBe(1);
    noteActivity();
    expect(unreadCalls()).toBe(1);
  });
});

describe("counts shared between tabs", () => {
  it("takes another tab's count as fresh, so this tab need not ask", async () => {
    receiveUnread({ userId: "user_1", unread: 5, at: Date.now() });
    await refreshUnread({ ifStale: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notificationSnapshot()).toMatchObject({ unread: 5, counted: true });
  });

  it("ignores another person's count", async () => {
    receiveUnread({ userId: "user_2", unread: 5, at: Date.now() });
    expect(notificationSnapshot().counted).toBe(false);
    await refreshUnread({ ifStale: true });
    expect(unreadCalls()).toBe(1);
  });

  it("ignores counts while signed out", () => {
    setNotificationUser(null);
    receiveUnread({ userId: "user_1", unread: 5, at: Date.now() });
    expect(notificationSnapshot().unread).toBe(0);
  });

  it("ignores a count older than the one held", async () => {
    await refreshUnread();
    const heldFrom = Date.now();
    vi.advanceTimersByTime(FRESH_MS + 1);
    receiveUnread({ userId: "user_1", unread: 9, at: heldFrom - 1 });
    expect(notificationSnapshot().unread).toBe(3);
    await refreshUnread({ ifStale: true });
    expect(unreadCalls()).toBe(2);
  });

  it("ignores counts while a change of its own is waiting on the server", async () => {
    const slow = deferred<ReturnType<typeof answer>>();
    fetchMock.mockImplementationOnce(() => slow.promise);
    const opening = openedFromPush(42);
    receiveUnread({ userId: "user_1", unread: 9, at: Date.now() + 1 });
    expect(notificationSnapshot().unread).toBe(0);
    slow.resolve(answer({ ok: true, unread: 1 }));
    await opening;
  });

  it("ignores malformed messages", () => {
    receiveUnread({ userId: "user_1", unread: -1, at: Date.now() });
    receiveUnread({ userId: "user_1", unread: "5", at: Date.now() });
    receiveUnread(null);
    expect(notificationSnapshot().counted).toBe(false);
  });

  it("reloads a list already on show when the shared count moved", () => {
    hydrateNotifications("user_1", { items: [], nextCursor: null, unread: 0 });
    vi.advanceTimersByTime(1);
    receiveUnread({ userId: "user_1", unread: 2, at: Date.now() });
    expect(listCalls()).toBe(1);
  });

  it("tells the other tabs the count it got, with whose it is and when its read began", async () => {
    const posted: unknown[] = [];
    class FakeChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(message: unknown) {
        posted.push(message);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const close = openUnreadChannel();
    const startedAt = Date.now();
    await refreshUnread();
    close();
    expect(posted).toEqual([{ userId: "user_1", unread: 3, at: startedAt }]);
  });
});
