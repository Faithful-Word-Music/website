/**
 * Light and dark mode.
 *
 * The site follows the device's setting until the visitor picks a theme with
 * the header toggle. That choice is saved in localStorage and written to
 * <html data-theme="...">, which globals.css reads. With no saved choice the
 * attribute is absent and the prefers-color-scheme media query decides.
 */

export type Theme = "light" | "dark";

/** The page's paper colour in each theme - --color-paper in globals.css. */
export const PAPER_LIGHT = "#faf9f6";
export const PAPER_DARK = "#141412";

/**
 * The page's background, inline in <head> (see layout.tsx) so it is there
 * before the stylesheet has loaded. Until something paints, a browser shows
 * the bare canvas - and the installed app on an iPhone showed it, light,
 * between its dark launch picture and the dark loading screen. With this (and
 * the color-scheme meta beside it) the canvas is the theme's paper from the
 * first frame. Written with :where(), so it has no weight of its own and
 * globals.css takes over the moment it arrives.
 */
export const canvasStyle = `:where(html){background:${PAPER_LIGHT}}@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"])){background:${PAPER_DARK}}}:where(html[data-theme="dark"]){background:${PAPER_DARK}}`;

/** The localStorage key holding the visitor's explicit choice. */
export const THEME_STORAGE_KEY = "theme";

/** A stored value, or null when nothing valid was saved. */
export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The theme actually showing: the saved choice, else the device's setting. */
export function resolveTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  return stored ?? (systemPrefersDark ? "dark" : "light");
}

/**
 * Runs in <head> before the first paint (see layout.tsx), so a saved choice is
 * applied without a flash of the other theme. Plain ES5: it runs before any
 * bundle has loaded.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
