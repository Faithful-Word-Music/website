import { describe, expect, it, vi } from "vitest";

import {
  KEEP_AWAKE_KEY,
  readKeepAwake,
  WakeLockController,
  writeKeepAwake,
  type WakeLockEnvironment,
  type WakeLockSentinelLike,
} from "./wake-lock";

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  private listeners: Array<() => void> = [];
  addEventListener(_: "release", listener: () => void) {
    this.listeners.push(listener);
  }
  async release() {
    if (this.released) return;
    this.released = true;
    this.listeners.forEach((listener) => listener());
  }
  /** The system letting it go (page hidden, battery saver). */
  revoke() {
    void this.release();
  }
}

/** A browser whose requests are answered when the test says so. */
function fakeBrowser({ supported = true } = {}) {
  let visible = true;
  let onVisibility: () => void = () => {};
  const requests: Array<{ resolve: (sentinel: FakeSentinel) => void; reject: (error: Error) => void; sentinel: FakeSentinel }> = [];
  const request = vi.fn(
    () =>
      new Promise<WakeLockSentinelLike>((resolve, reject) => {
        const sentinel = new FakeSentinel();
        requests.push({ resolve: () => resolve(sentinel), reject, sentinel });
      }),
  );
  const env: WakeLockEnvironment = {
    wakeLock: supported ? { request } : undefined,
    isVisible: () => visible,
    onVisibilityChange: (listener) => {
      onVisibility = listener;
      return () => {
        onVisibility = () => {};
      };
    },
  };
  return {
    env,
    request,
    requests,
    grant: async (index = requests.length - 1) => {
      requests[index].resolve(requests[index].sentinel);
      await flush();
      return requests[index].sentinel;
    },
    refuse: async (index = requests.length - 1) => {
      requests[index].reject(new Error("NotAllowedError"));
      await flush();
    },
    setVisible: async (value: boolean) => {
      visible = value;
      onVisibility();
      await flush();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Keep Screen Awake: the setting", () => {
  function memory(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  }

  it("is on when nothing has been saved", () => {
    expect(readKeepAwake(memory())).toBe(true);
    expect(readKeepAwake(null)).toBe(true);
  });

  it("remembers being turned off, and on again", () => {
    const storage = memory();
    writeKeepAwake(storage, false);
    expect(storage.getItem(KEEP_AWAKE_KEY)).toBe("off");
    expect(readKeepAwake(storage)).toBe(false);
    writeKeepAwake(storage, true);
    expect(readKeepAwake(storage)).toBe(true);
  });

  it("falls back to on when storage throws (private browsing)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readKeepAwake(broken)).toBe(true);
    expect(() => writeKeepAwake(broken, false)).not.toThrow();
  });
});

describe("Keep Screen Awake: the lock", () => {
  it("asks for nothing until playback starts", () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    expect(lock.status).toBe("idle");
    expect(browser.request).not.toHaveBeenCalled();
  });

  it("holds a lock while playing and releases it on pause", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    expect(browser.request).toHaveBeenCalledWith("screen");
    const sentinel = await browser.grant();
    expect(lock.status).toBe("active");
    lock.setWanted(false);
    expect(sentinel.released).toBe(true);
    expect(lock.status).toBe("idle");
  });

  it("releases on unmount, and ignores everything after", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    const sentinel = await browser.grant();
    lock.dispose();
    expect(sentinel.released).toBe(true);
    lock.setWanted(true);
    await browser.setVisible(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
  });

  it("releases a lock that arrives after unmount", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    lock.dispose();
    const late = await browser.grant();
    expect(late.released).toBe(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
  });

  it("never has two requests out at once, however fast play and pause change", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    lock.setWanted(false);
    lock.setWanted(true);
    lock.setWanted(false);
    lock.setWanted(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
    // The first answer was for an earlier "play": released, and asked for afresh for this one.
    const first = await browser.grant(0);
    expect(first.released).toBe(true);
    expect(browser.request).toHaveBeenCalledTimes(2);
    const second = await browser.grant(1);
    expect(second.released).toBe(false);
    expect(lock.status).toBe("active");
  });

  it("ends paused when a late answer comes after the last pause", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    lock.setWanted(false);
    const late = await browser.grant();
    expect(late.released).toBe(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
    expect(lock.status).toBe("idle");
  });

  it("lets go while the page is hidden and asks again once it is shown, if still playing", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    const sentinel = await browser.grant();
    // Browsers revoke the lock themselves when the page is hidden.
    sentinel.revoke();
    await browser.setVisible(false);
    expect(lock.status).toBe("waiting");
    expect(browser.request).toHaveBeenCalledTimes(1);
    await browser.setVisible(true);
    expect(browser.request).toHaveBeenCalledTimes(2);
    await browser.grant();
    expect(lock.status).toBe("active");
  });

  it("does not ask again on being shown when nothing is playing", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    await browser.grant();
    lock.setWanted(false);
    await browser.setVisible(false);
    await browser.setVisible(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
  });

  it("after a revocation, waits for a change instead of asking again at once", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    const sentinel = await browser.grant();
    sentinel.revoke();
    await flush();
    expect(lock.status).toBe("waiting");
    expect(browser.request).toHaveBeenCalledTimes(1);
    // The next play (the next song, or Play again) is that change.
    lock.setWanted(false);
    lock.setWanted(true);
    expect(browser.request).toHaveBeenCalledTimes(2);
  });

  it("does not retry a refused request in a loop, and tries once more on the next play", async () => {
    const browser = fakeBrowser();
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    await browser.refuse();
    expect(lock.status).toBe("refused");
    await flush();
    expect(browser.request).toHaveBeenCalledTimes(1);
    lock.setWanted(false);
    lock.setWanted(true);
    expect(browser.request).toHaveBeenCalledTimes(2);
  });

  it("says when the browser cannot do it, and never throws", () => {
    const browser = fakeBrowser({ supported: false });
    const statuses: string[] = [];
    const lock = new WakeLockController(browser.env, (status) => statuses.push(status));
    expect(lock.status).toBe("unsupported");
    expect(() => lock.setWanted(true)).not.toThrow();
    expect(lock.status).toBe("unsupported");
    lock.dispose();
  });

  it("does not ask while the page is hidden", async () => {
    const browser = fakeBrowser();
    await browser.setVisible(false);
    const lock = new WakeLockController(browser.env);
    lock.setWanted(true);
    expect(browser.request).not.toHaveBeenCalled();
    expect(lock.status).toBe("waiting");
  });
});
