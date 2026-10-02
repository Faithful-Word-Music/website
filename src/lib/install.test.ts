import { describe, expect, it } from "vitest";

import { detectInstallMode, type InstallEnvironment } from "./install";

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  // iPadOS asks for the desktop site by default, so it looks like a Mac.
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  oldMacSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  oldIphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.169 Mobile/15E148 Safari/604.1",
  oldIphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  desktopFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
};

function env(userAgent: string, overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { userAgent, maxTouchPoints: 0, standalone: false, hasPrompt: false, ...overrides };
}

describe("detectInstallMode", () => {
  it("offers nothing once running as the installed app", () => {
    expect(detectInstallMode(env(UA.androidChrome, { standalone: true, hasPrompt: true }))).toBe("installed");
    expect(detectInstallMode(env(UA.iphoneSafari, { standalone: true, maxTouchPoints: 5 }))).toBe("installed");
  });

  it("uses the browser's install dialog when Chromium has offered one", () => {
    expect(detectInstallMode(env(UA.androidChrome, { hasPrompt: true, maxTouchPoints: 5 }))).toBe("prompt");
    expect(detectInstallMode(env(UA.desktopChrome, { hasPrompt: true }))).toBe("prompt");
  });

  it("offers nothing in Chromium without an install event (already installed, or not yet eligible)", () => {
    expect(detectInstallMode(env(UA.androidChrome, { maxTouchPoints: 5 }))).toBe("none");
    expect(detectInstallMode(env(UA.desktopChrome))).toBe("none");
    expect(detectInstallMode(env(UA.macChrome))).toBe("none");
  });

  it("explains Add to Home Screen on iPhone and iPad, in any browser", () => {
    expect(detectInstallMode(env(UA.iphoneSafari, { maxTouchPoints: 5 }))).toBe("ios");
    expect(detectInstallMode(env(UA.iphoneChrome, { maxTouchPoints: 5 }))).toBe("ios");
    expect(detectInstallMode(env(UA.ipadAsMac, { maxTouchPoints: 5 }))).toBe("ios");
  });

  it("still explains Add to Home Screen in Safari on an older iPhone", () => {
    expect(detectInstallMode(env(UA.oldIphoneSafari, { maxTouchPoints: 5 }))).toBe("ios");
  });

  it("sends people to Safari where their iOS browser cannot add to the Home Screen", () => {
    expect(detectInstallMode(env(UA.oldIphoneChrome, { maxTouchPoints: 5 }))).toBe("ios-open-safari");
    expect(detectInstallMode(env(UA.iphoneInstagram, { maxTouchPoints: 5 }))).toBe("ios-open-safari");
  });

  it("explains Add to Dock in Safari 17+ on a Mac", () => {
    expect(detectInstallMode(env(UA.macSafari))).toBe("mac-safari");
    expect(detectInstallMode(env(UA.oldMacSafari))).toBe("none");
  });

  it("offers nothing where installing is not possible", () => {
    expect(detectInstallMode(env(UA.desktopFirefox))).toBe("none");
  });
});
