import { describe, expect, it } from "vitest";

import {
  isSignInCallback,
  looksSignedIn,
  MIN_VISIBLE_MS,
  readyToHide,
  SPLASH_ATTRIBUTE,
  SPLASH_CONTINUE_KEY,
  SPLASH_SEEN_KEY,
  splashInitScript,
} from "./splash";

describe("looksSignedIn", () => {
  it("sees a Clerk sign-in time", () => {
    expect(looksSignedIn("__client_uat=1759300000")).toBe(true);
    expect(looksSignedIn("theme=dark; __client_uat_Xy1Z2=1759300000; other=1")).toBe(true);
  });

  it("ignores a signed-out cookie, or none", () => {
    expect(looksSignedIn("__client_uat=0")).toBe(false);
    expect(looksSignedIn("__client_uat_Xy1Z2=0; theme=dark")).toBe(false);
    expect(looksSignedIn("")).toBe(false);
    expect(looksSignedIn("not__client_uat=123")).toBe(false);
  });
});

describe("splashInitScript", () => {
  it("is a self-contained script that parses", () => {
    expect(() => new Function(splashInitScript)).not.toThrow();
  });
});

/** Runs the <head> script against a pretend page; returns the <html> attribute it set, if any. */
function runScript({
  standalone = false,
  cookie,
  pathname = "/dashboard",
  seen = false,
  handoff,
}: {
  standalone?: boolean;
  cookie: string;
  pathname?: string;
  seen?: boolean;
  /** A SPLASH_CONTINUE_KEY left by the page before. */
  handoff?: number;
}) {
  const attributes = new Map<string, string>();
  const storage = new Map<string, string>(seen ? [[SPLASH_SEEN_KEY, "1"]] : []);
  if (handoff !== undefined) storage.set(SPLASH_CONTINUE_KEY, String(handoff));
  const window: { matchMedia: () => { matches: boolean }; __splashFailsafe?: number } = {
    matchMedia: () => ({ matches: standalone }),
  };
  const document = {
    cookie,
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value), removeAttribute: () => {} },
  };
  const sessionStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  };
  new Function("window", "navigator", "document", "location", "sessionStorage", "performance", "setTimeout", "Date", splashInitScript)(
    window,
    {},
    document,
    { pathname },
    sessionStorage,
    { now: () => 123.4 },
    () => 7,
    { now: () => NOW },
  );
  return {
    splash: attributes.get(SPLASH_ATTRIBUTE),
    failsafe: window.__splashFailsafe,
    seen: storage.has(SPLASH_SEEN_KEY),
    handoff: storage.get(SPLASH_CONTINUE_KEY),
  };
}

/** Date.now() on the pretend page. */
const NOW = 1_790_000_000_000;

describe("splashInitScript on a page", () => {
  it("puts the screen up once per tab for a signed-in member, stamped with the time", () => {
    expect(runScript({ cookie: "__client_uat=1759300000" })).toEqual({ splash: "123", failsafe: 7, seen: true, handoff: undefined });
    expect(runScript({ cookie: "__client_uat=1759300000", seen: true }).splash).toBeUndefined();
    expect(runScript({ cookie: "__client_uat=0" }).splash).toBeUndefined();
  });

  it("puts it up on the way back from signing in, inside the app only", () => {
    expect(runScript({ standalone: true, cookie: "", pathname: "/login/sso-callback", seen: true }).splash).toBe("123");
    expect(runScript({ standalone: false, cookie: "", pathname: "/login/sso-callback" }).splash).toBeUndefined();
    expect(runScript({ standalone: true, cookie: "", pathname: "/login" }).splash).toBeUndefined();
  });
});

describe("splashInitScript carrying on from the page before", () => {
  it("keeps a fresh screen up from the first frame, counted from when it first went up", () => {
    // Up 600ms ago on the page before; this page is 123.4ms old.
    const result = runScript({ cookie: "__client_uat=1759300000", seen: true, handoff: NOW - 600 });
    expect(result.splash).toBe(String(Math.round(123.4 - 600)));
    expect(result.handoff).toBe(String(NOW - 600));
  });

  it("ignores and clears a stale handoff", () => {
    const result = runScript({ cookie: "__client_uat=1759300000", seen: true, handoff: NOW - 60_000 });
    expect(result.splash).toBeUndefined();
    expect(result.handoff).toBeUndefined();
  });
});

describe("isSignInCallback", () => {
  it("is Clerk's return from another sign-in provider", () => {
    expect(isSignInCallback("/login/sso-callback")).toBe(true);
    expect(isSignInCallback("/login")).toBe(false);
    expect(isSignInCallback("/dashboard")).toBe(false);
  });
});

describe("readyToHide", () => {
  it("waits for the minimum time, any placeholder, the fonts and the next page", () => {
    const ready = { shownFor: MIN_VISIBLE_MS, held: false, fontsReady: true, waitingForPage: false };
    expect(readyToHide(ready)).toBe(true);
    expect(readyToHide({ ...ready, shownFor: MIN_VISIBLE_MS - 1 })).toBe(false);
    expect(readyToHide({ ...ready, shownFor: 5000, held: true })).toBe(false);
    expect(readyToHide({ ...ready, shownFor: 5000, fontsReady: false })).toBe(false);
    expect(readyToHide({ ...ready, shownFor: 5000, waitingForPage: true })).toBe(false);
  });
});
