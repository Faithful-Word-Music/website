import { describe, expect, it, vi } from "vitest";

import { appLoginUrl, appOnlyInitScript, isOpenInApp, needsAppLogin } from "./app-only";

describe("isOpenInApp", () => {
  it("keeps the way to an account open", () => {
    expect(isOpenInApp("/login")).toBe(true);
    expect(isOpenInApp("/login/factor-one")).toBe(true);
    expect(isOpenInApp("/accept-invite")).toBe(true);
    expect(isOpenInApp("/request-access")).toBe(true);
  });

  it("closes the public site", () => {
    expect(isOpenInApp("/")).toBe(false);
    expect(isOpenInApp("/song-list")).toBe(false);
    expect(isOpenInApp("/library/songs/the-solid-rock")).toBe(false);
    expect(isOpenInApp("/loginx")).toBe(false);
  });
});

describe("appLoginUrl", () => {
  it("comes back to the page afterwards", () => {
    expect(appLoginUrl("https://faithfulwordmusic.com", "/song-list", "?m=2")).toBe(
      "/login?redirect_url=https%3A%2F%2Ffaithfulwordmusic.com%2Fsong-list%3Fm%3D2",
    );
  });

  it("goes to the Dashboard from the home page", () => {
    expect(appLoginUrl("https://faithfulwordmusic.com", "/", "")).toBe("/login");
  });
});

describe("needsAppLogin", () => {
  it("sends signed-out people to log in, except on the account pages", () => {
    expect(needsAppLogin({ cookie: "__client_uat=0", pathname: "/song-list" })).toBe(true);
    expect(needsAppLogin({ cookie: "", pathname: "/" })).toBe(true);
    expect(needsAppLogin({ cookie: "", pathname: "/login" })).toBe(false);
    expect(needsAppLogin({ cookie: "__client_uat=1759300000", pathname: "/song-list" })).toBe(false);
  });
});

/** Runs the <head> script against a pretend page. */
function runScript({ standalone, cookie, pathname }: { standalone: boolean; cookie: string; pathname: string }) {
  const replace = vi.fn();
  const window = { matchMedia: () => ({ matches: standalone }) };
  const location = { pathname, search: "", origin: "https://faithfulwordmusic.com", replace };
  new Function("window", "navigator", "document", "location", appOnlyInitScript)(window, {}, { cookie }, location);
  return replace;
}

describe("appOnlyInitScript", () => {
  it("matches the rules above inside the app", () => {
    expect(runScript({ standalone: true, cookie: "", pathname: "/song-list" })).toHaveBeenCalledWith(
      appLoginUrl("https://faithfulwordmusic.com", "/song-list", ""),
    );
    expect(runScript({ standalone: true, cookie: "", pathname: "/" })).toHaveBeenCalledWith("/login");
    expect(runScript({ standalone: true, cookie: "", pathname: "/login" })).not.toHaveBeenCalled();
    expect(runScript({ standalone: true, cookie: "__client_uat=1759300000", pathname: "/" })).not.toHaveBeenCalled();
  });

  it("leaves the website in a browser alone", () => {
    expect(runScript({ standalone: false, cookie: "", pathname: "/song-list" })).not.toHaveBeenCalled();
  });
});
