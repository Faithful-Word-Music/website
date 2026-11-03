/**
 * Where a popover goes against the control that opened it - pure arithmetic,
 * so it is tested without a browser (position.test.ts).
 *
 * It opens on the asked-for side and flips to the other when there is more
 * room there and not enough where asked. Sideways it lines up with the
 * control's start or end edge, then is kept `edge` px inside the window - and
 * clear of Conductor's panel on the right (`insetRight`, the page's
 * --conductor-inset), so it never slides underneath it. `maxHeight` is the
 * room on the chosen side, for a popover that should scroll rather than run
 * off the screen.
 */

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  /** The side it ended up on, after any flip. */
  placement: Placement;
  /** The most height there is room for on that side. */
  maxHeight: number;
}

export function computePopoverPosition({
  anchor,
  size,
  viewport,
  placement,
  gap = 8,
  edge = 8,
}: {
  anchor: AnchorRect;
  /** The popover's own size, as rendered. */
  size: { width: number; height: number };
  /** The window, and how much of its right side Conductor's panel covers. */
  viewport: { width: number; height: number; insetRight?: number };
  placement: Placement;
  /** Space between the control and the popover. */
  gap?: number;
  /** The least space kept to the window's edges. */
  edge?: number;
}): PopoverPosition {
  const [side, align] = placement.split("-") as ["bottom" | "top", "start" | "end"];

  const below = Math.max(0, viewport.height - anchor.bottom - gap - edge);
  const above = Math.max(0, anchor.top - gap - edge);
  const asked = side === "bottom" ? below : above;
  const other = side === "bottom" ? above : below;
  const finalSide = size.height > asked && other > asked ? (side === "bottom" ? "top" : "bottom") : side;
  const room = finalSide === "bottom" ? below : above;
  const height = Math.min(size.height, room);
  const top = finalSide === "bottom" ? anchor.bottom + gap : anchor.top - gap - height;

  const minLeft = edge;
  const maxLeft = viewport.width - (viewport.insetRight ?? 0) - edge - size.width;
  const wanted = align === "end" ? anchor.right - size.width : anchor.left;
  // Wider than the room there is: pinned to the left edge, as much in view as can be.
  const left = maxLeft < minLeft ? minLeft : Math.min(Math.max(wanted, minLeft), maxLeft);

  return { top, left, placement: `${finalSide}-${align}` as Placement, maxHeight: room };
}

/** --conductor-inset in px, as the page has it now (0 when Conductor's panel is closed). */
export function readConductorInset(root: Element = document.documentElement): number {
  const value = parseFloat(getComputedStyle(root).getPropertyValue("--conductor-inset"));
  return Number.isFinite(value) ? value : 0;
}
