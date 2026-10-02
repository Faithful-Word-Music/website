/**
 * Installing the site as an app ("Install Faithful Word Music").
 *
 * The web app manifest (src/app/manifest.ts) is what makes the site
 * installable. This file decides whether the site should OFFER installing on
 * the current device, and how - which only signed-in members are shown (see
 * src/components/account/InstallApp.tsx).
 *
 * Platforms differ:
 *   - Chromium (Chrome, Edge, Samsung Internet; desktop and Android) fires
 *     `beforeinstallprompt` when the site can be installed, and the site can
 *     open the browser's own install dialog from a button.
 *   - iPhone and iPad have no install event in any browser. Installing is
 *     Share, then Add to Home Screen, so the site can only explain the steps.
 *     Browsers other than Safari can only do this from iOS 16.4, and apps'
 *     built-in browsers (Facebook, Instagram) never can - those are told to
 *     open the page in Safari.
 *   - Safari on a Mac (17+) installs with File, then Add to Dock - again only
 *     explainable.
 *   - Firefox on the desktop cannot install sites at all, so nothing is shown.
 *
 * No service worker is needed for any of this: Chromium dropped that
 * requirement, and Safari never had it.
 */

export type InstallMode = "installed" | "prompt" | "ios" | "ios-open-safari" | "mac-safari" | "none";

/** The window property the capture script below keeps the install event in. */
export const INSTALL_PROMPT_KEY = "__fwmInstallPrompt";

/** Fired on window by the capture script when a new install event is kept. */
export const INSTALL_PROMPT_EVENT = "fwm:installprompt";

/**
 * Runs in <head> before any bundle (see layout.tsx). Chromium can fire
 * `beforeinstallprompt` before React has hydrated, so it is caught here and
 * kept for the install button.
 *
 * `preventDefault()` also stops Chrome on Android from showing its own
 * "Add to Home screen" bar on its own initiative, so visitors who are not
 * signed in are never prompted to install. Installing from the browser's own
 * menu still works for anyone; the site does not fight that.
 *
 * Plain ES5: it runs before any bundle has loaded.
 */
export const installPromptCaptureScript = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window[${JSON.stringify(
  INSTALL_PROMPT_KEY,
)}]=e;window.dispatchEvent(new Event(${JSON.stringify(INSTALL_PROMPT_EVENT)}))});window.addEventListener("appinstalled",function(){window[${JSON.stringify(
  INSTALL_PROMPT_KEY,
)}]=null})}catch(e){}})()`;

export interface InstallEnvironment {
  userAgent: string;
  /** navigator.maxTouchPoints - how iPadOS, which reports a Mac, gives itself away. */
  maxTouchPoints: number;
  /** Already running as the installed app (display-mode: standalone, or iOS's navigator.standalone). */
  standalone: boolean;
  /** Chromium has handed over an install event that has not been used yet. */
  hasPrompt: boolean;
}

/** How (and whether) to offer installing on this device. */
export function detectInstallMode({ userAgent, maxTouchPoints, standalone, hasPrompt }: InstallEnvironment): InstallMode {
  if (standalone) return "installed";
  if (hasPrompt) return "prompt";

  const isMac = /Macintosh/.test(userAgent);
  if (isIosDevice(userAgent, maxTouchPoints)) {
    if (IOS_IN_APP_BROWSER.test(userAgent)) return "ios-open-safari";
    // Chrome, Edge and Firefox on iOS 16.4+ can Add to Home Screen as Safari can; before that, only Safari.
    if (IOS_OTHER_BROWSER.test(userAgent) && iosVersion(userAgent) < 16.4) return "ios-open-safari";
    return "ios";
  }

  if (isMac && isSafari(userAgent)) {
    const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1] ?? 0);
    if (version >= 17) return "mac-safari";
  }
  return "none";
}

/** An iPhone or iPad, including iPadOS, which reports itself as a Mac with a touch screen. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Chrome, Firefox, Edge and Opera on iOS name themselves with these. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS/;

/** Browsers built into other apps, which cannot add to the Home Screen at all. */
const IOS_IN_APP_BROWSER = /FBAN|FBAV|Instagram/;

/** "OS 15_6 like Mac OS X" -> 15.6. Unknown (iPadOS reporting a Mac) counts as current. */
function iosVersion(userAgent: string): number {
  const match = /OS (\d+)_(\d+)/.exec(userAgent);
  return match ? Number(match[1]) + Number(match[2]) / 10 : Infinity;
}

/** Safari itself, not another browser that also says "Safari" in its user agent. */
function isSafari(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(userAgent);
}
