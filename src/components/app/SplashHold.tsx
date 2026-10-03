import { SPLASH_HOLD_ATTRIBUTE } from "@/lib/splash";

/**
 * Put in a loading.tsx: while this placeholder is on the page, the loading
 * screen (src/lib/splash.ts), if it is up, stays up - so it fades onto the
 * finished page rather than its skeleton. Does nothing when the screen is not
 * up (most moves between pages).
 */
export function SplashHold() {
  return <span {...{ [SPLASH_HOLD_ATTRIBUTE]: "" }} hidden />;
}
