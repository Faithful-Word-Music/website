import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FRESH_MS, refreshUnread, setNotificationUser } from "./notification-store";

/** How often the bell asks for its count (src/components/notifications/notification-store.ts). */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, unread: 3 }) }));
  vi.stubGlobal("fetch", fetchMock);
  setNotificationUser(null);
  setNotificationUser("user_1");
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
});
