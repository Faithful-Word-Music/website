"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { computePopoverPosition, readConductorInset, type Placement, type PopoverPosition } from "./position";

/**
 * The mechanics every popover on the site shares: placing it against the
 * control that opened it and keeping it there, and the ways it is dismissed.
 * The menus (Menu.tsx), the header's disclosures (NavMenu, the account menu)
 * and the notification panel all use it. Mount the popover to open it;
 * unmount it to close. Use it through <Popover>, or directly where a
 * component draws its own panel (Menu).
 *
 * IT SETS NO ROLE. What the popover IS stays the caller's to say, because the
 * keyboard and screen-reader contract differs: a menu of actions is
 * role="menu" with arrow keys (Menu.tsx); a list of links behind a button is a
 * plain disclosure; the notification panel is a non-modal role="dialog".
 *
 * PLACEMENT. `position: fixed`, from the control's rect (position.ts): flips
 * above or below for room, stays inside the window and clear of Conductor's
 * panel. It follows the control on any scroll (the page's or a scrolling box
 * around it), on resize, when the control or the popover changes size, and
 * when Conductor's panel opens, closes or is dragged wider. Until placed it is
 * transparent - not hidden, which would stop it taking focus.
 *
 * Where it is in the DOM (`portal`):
 *   true   moved to <body> - or into the open <dialog> the control is in, as
 *          anything under <body> would sit behind a dialog in the top layer.
 *          For popovers whose own surroundings would clip them (a card).
 *   false  left where it is rendered, so Tab order runs from the control
 *          straight into it and on. For the header, whose controls are in a
 *          row. An ancestor that is a containing block for fixed elements
 *          (the header's frosted glass is one) is measured and allowed for.
 *
 * DISMISSAL, reported to `onDismiss` with the reason, so each caller decides
 * where focus goes:
 *   "escape"        Escape while focus is in the popover or on its control.
 *                   Stopped there, so it does not also close a dialog around
 *                   it or leave a mode the page is in.
 *   "outside"       a press anywhere but the popover or its control.
 *   "tab"           Tab out of it (only with `closeOnTab`, as menus do).
 *   "trigger-lost"  its control was removed or hidden - a layout change at a
 *                   new width put it away. If focus was inside, it moves to
 *                   `fallbackFocus()` rather than being stranded.
 */

export type DismissReason = "escape" | "outside" | "tab" | "trigger-lost";

export interface UsePopoverOptions {
  triggerRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  onDismiss: (reason: DismissReason) => void;
  placement?: Placement;
  gap?: number;
  portal?: boolean;
  /**
   * Where focus goes on opening:
   *   "first"      the first item matching `itemSelector` (a menu)
   *   "container"  the popover itself (a panel to read; give it tabIndex={-1})
   *   "none"       stays on the control (a disclosure opened by a click)
   */
  initialFocus?: "first" | "container" | "none";
  itemSelector?: string;
  closeOnTab?: boolean;
  /** With "trigger-lost": somewhere sensible for focus to go (the control that replaced it). */
  fallbackFocus?: () => HTMLElement | null;
}

export interface UsePopoverResult {
  /** Where to portal it (null until known, or when not portalled). */
  container: Element | null;
  /** Its inline style: position, offsets, max height. */
  style: CSSProperties;
  /** Placed yet: until then the popover is transparent. */
  placed: boolean;
  /** The side it opened on, after any flip. */
  placement: Placement;
}

/**
 * Where `position: fixed; top: 0; left: 0` really lands inside `parent`: the
 * window's corner, unless an ancestor is a containing block for fixed
 * elements (a transform, a filter, a backdrop blur).
 */
function fixedOrigin(parent: Element | null): { x: number; y: number } {
  if (!parent) return { x: 0, y: 0 };
  const probe = document.createElement("span");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none";
  parent.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return { x: rect.left, y: rect.top };
}

/** Whether an element is in the page and laid out (display: none has no boxes). */
function isShown(element: HTMLElement | null): element is HTMLElement {
  return !!element && element.isConnected && element.getClientRects().length > 0;
}

export function usePopover({
  triggerRef,
  popoverRef,
  onDismiss,
  placement = "bottom-end",
  gap = 8,
  portal = true,
  initialFocus = "none",
  itemSelector = "[role=menuitem]",
  closeOnTab = false,
  fallbackFocus,
}: UsePopoverOptions): UsePopoverResult {
  const [container, setContainer] = useState<Element | null>(null);
  const [position, setPosition] = useState<(PopoverPosition & { originX: number; originY: number }) | null>(null);

  // The latest callbacks, read by the listeners without re-subscribing them on
  // every render (pages that tick a clock re-render often).
  const onDismissRef = useRef(onDismiss);
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    fallbackRef.current = fallbackFocus;
  });

  useLayoutEffect(() => {
    if (!portal) return;
    setContainer(triggerRef.current?.closest("dialog[open]") ?? document.body);
  }, [portal, triggerRef]);

  const ready = !portal || container !== null;

  // Place it, and keep it placed.
  useLayoutEffect(() => {
    if (!ready) return;
    let frame = 0;
    let lost = false;

    function place() {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!popover) return;
      if (!isShown(trigger)) {
        if (lost) return;
        lost = true;
        const hadFocus = popover.contains(document.activeElement) || document.activeElement === trigger;
        onDismissRef.current("trigger-lost");
        if (hadFocus) fallbackRef.current?.()?.focus({ preventScroll: true });
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const next = computePopoverPosition({
        anchor: rect,
        size: { width: popover.offsetWidth, height: popover.scrollHeight },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight, insetRight: readConductorInset() },
        placement,
        gap,
      });
      // A fixed element inside a containing block (a transform, a filter, the
      // header's backdrop blur) is placed from that block, not the window:
      // find where its 0,0 really is, and allow for it.
      // Measured with a probe beside it, not the popover itself, whose own
      // entrance animation (a short slide) would throw the measurement off.
      const { x: originX, y: originY } = fixedOrigin(popover.parentElement);
      setPosition((previous) =>
        previous &&
        previous.top === next.top &&
        previous.left === next.left &&
        previous.maxHeight === next.maxHeight &&
        previous.placement === next.placement &&
        Math.abs(previous.originX - originX) < 0.5 &&
        Math.abs(previous.originY - originY) < 0.5
          ? previous
          : { ...next, originX, originY },
      );
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }

    place();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (triggerRef.current) resize?.observe(triggerRef.current);
    if (popoverRef.current) resize?.observe(popoverRef.current);
    // Conductor's panel sets --conductor-inset on <html> as it opens, closes and is dragged.
    const inset = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    inset?.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-conductor"] });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      inset?.disconnect();
    };
  }, [ready, triggerRef, popoverRef, placement, gap]);

  // Focus on opening, once placed.
  const focused = useRef(false);
  useEffect(() => {
    if (!position || focused.current) return;
    focused.current = true;
    const popover = popoverRef.current;
    if (initialFocus === "first") popover?.querySelector<HTMLElement>(itemSelector)?.focus({ preventScroll: true });
    else if (initialFocus === "container") popover?.focus({ preventScroll: true });
  }, [position, initialFocus, itemSelector, popoverRef]);

  // Dismissal.
  useEffect(() => {
    if (!ready) return;
    function within(target: EventTarget | null) {
      const node = target as Node | null;
      return !!node && (!!popoverRef.current?.contains(node) || !!triggerRef.current?.contains(node));
    }
    function onPointerDown(event: PointerEvent) {
      if (!within(event.target)) onDismissRef.current("outside");
    }
    function onKeyDown(event: KeyboardEvent) {
      // Focus on nothing in particular (a press on the popover's plain text) still counts as being in it.
      const active = document.activeElement;
      const loose = !active || active === document.body;
      if (event.key === "Escape" && (loose || within(active))) {
        // Captured before anything inside sees it: one Escape closes one thing.
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current("escape");
      } else if (event.key === "Tab" && closeOnTab && popoverRef.current?.contains(document.activeElement)) {
        onDismissRef.current("tab");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ready, closeOnTab, popoverRef, triggerRef]);

  const style: CSSProperties = position
    ? {
        position: "fixed",
        top: position.top - position.originY,
        left: position.left - position.originX,
        // The room on its side, or less if the popover sets --popover-max-height.
        maxHeight: `min(${position.maxHeight}px, var(--popover-max-height, ${position.maxHeight}px))`,
      }
    : // Out of sight but laid out, so it can be measured (and focused).
      { position: "fixed", top: 0, left: 0, opacity: 0 };

  return { container: portal ? container : null, style, placed: position !== null, placement: position?.placement ?? placement };
}
