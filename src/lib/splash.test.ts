import { describe, expect, it } from "vitest";

import {
  isSignInCallback,
  looksSignedIn,
  MIN_VISIBLE_MS,
  readyToHide,
  SPLASH_ATTRIBUTE,
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
}: {
  standalone?: boolean;
  cookie: string;
  pathname?: string;
  seen?: boolean;
}) {
  const attributes = new Map<string, string>();
  const storage = new Map<string, string>(seen ? [[SPLASH_SEEN_KEY, "1"]] : []);
  const window: { matchMedia: () => { matches: boolean }; __splashFailsafe?: number } = {
    matchMedia: () => ({ matches: standalone }),
  };
  const document = {
    cookie,
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value), removeAttribute: () => {} },
  };
  const sessionStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (k: string, v: string) => storage.set(k, v) };
  new Function("window", "navigator", "document", "location", "sessionStorage", "performance", "setTimeout", splashInitScript)(
    window,
    {},
    document,
    { pathname },
    sessionStorage,
    { now: () => 123.4 },
    () => 7,
  );
  return { splash: attributes.get(SPLASH_ATTRIBUTE), failsafe: window.__splashFailsafe, seen: storage.has(SPLASH_SEEN_KEY) };
}

describe("splashInitScript on a page", () => {
  it("puts the screen up once per tab for a signed-in member, stamped with the time", () => {
    expect(runScript({ cookie: "__client_uat=1759300000" })).toEqual({ splash: "123", failsafe: 7, seen: true });
    expect(runScript({ cookie: "__client_uat=1759300000", seen: true }).splash).toBeUndefined();
    expect(runScript({ cookie: "__client_uat=0" }).splash).toBeUndefined();
  });

  it("puts it up on the way back from signing in, inside the app only", () => {
    expect(runScript({ standalone: true, cookie: "", pathname: "/login/sso-callback", seen: true }).splash).toBe("123");
    expect(runScript({ standalone: false, cookie: "", pathname: "/login/sso-callback" }).splash).toBeUndefined();
    expect(runScript({ standalone: true, cookie: "", pathname: "/login" }).splash).toBeUndefined();
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
  it("waits for the minimum time, any placeholder, and the next page", () => {
    expect(readyToHide({ shownFor: MIN_VISIBLE_MS, held: false, waitingForPage: false })).toBe(true);
    expect(readyToHide({ shownFor: MIN_VISIBLE_MS - 1, held: false, waitingForPage: false })).toBe(false);
    expect(readyToHide({ shownFor: 5000, held: true, waitingForPage: false })).toBe(false);
    expect(readyToHide({ shownFor: 5000, held: false, waitingForPage: true })).toBe(false);
  });
});
