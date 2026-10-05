/**
 * The floating Conductor panel's width on a wide screen: its default, how far
 * it can be dragged either way, and how the person's choice is kept. The
 * panel itself is src/components/conductor/ConductorDock.tsx.
 *
 * Pure - no browser API - so it can be unit tested.
 */

/** Below this the panel is a sheet over the page instead of a column beside it. */
export const DRAWER_MIN_VIEWPORT = 1024;
export const DRAWER_MEDIA_QUERY = `(min-width: ${DRAWER_MIN_VIEWPORT}px)`;

export const DRAWER_DEFAULT_WIDTH = 420;
export const DRAWER_MIN_WIDTH = 340;
/** The page beside the panel always keeps at least this much... */
export const PAGE_MIN_WIDTH = 520;
/** ...and the panel never takes more than this share of the window. */
export const DRAWER_MAX_SHARE = 0.62;
/** How far one press of an arrow key moves the edge. */
export const DRAWER_KEY_STEP = 24;

/** localStorage: the width the person last dragged the panel to. */
export const DRAWER_WIDTH_KEY = "fwm:conductor-width";

export interface DrawerBounds {
  min: number;
  max: number;
}

/** How narrow and how wide the panel may be in a window this wide. */
export function drawerBounds(viewportWidth: number): DrawerBounds {
  const max = Math.floor(Math.min(viewportWidth - PAGE_MIN_WIDTH, viewportWidth * DRAWER_MAX_SHARE));
  return { min: DRAWER_MIN_WIDTH, max: Math.max(DRAWER_MIN_WIDTH, max) };
}

/** `width` brought within what this window allows. */
export function clampDrawerWidth(width: number, viewportWidth: number): number {
  const { min, max } = drawerBounds(viewportWidth);
  if (!Number.isFinite(width)) return Math.min(Math.max(DRAWER_DEFAULT_WIDTH, min), max);
  return Math.round(Math.min(Math.max(width, min), max));
}

/** The width for a pointer at `pointerX`: the panel runs from there to the window's right edge. */
export function widthFromPointer(pointerX: number, viewportWidth: number): number {
  return clampDrawerWidth(viewportWidth - pointerX, viewportWidth);
}

/** A stored width, or null for anything that is not one (the default is then used). */
export function parseStoredWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const width = Number(raw);
  return Number.isFinite(width) && width >= 200 && width <= 4000 ? Math.round(width) : null;
}
