"use client";

import { useEffect } from "react";

/**
 * Locks the page while `active` - for overlays such as the mobile menu, the
 * search palette and dialogs. Nested locks (a dialog over the menu) only
 * unlock when the last one closes.
 *
 * The page is never moved, and how it is held depends on the scrollbar:
 *
 *   A scrollbar that takes room (a desktop with a mouse): the scrollbar
 *   stays where it is, visible, and the page simply does not scroll. Hiding
 *   it would leave an empty strip where it was (or shift everything
 *   sideways), so instead what would scroll the page is stopped - the wheel,
 *   the scrolling keys, a touchscreen's drag - unless it is scrolling
 *   something inside the overlay that can still scroll that way. Anything
 *   that moves the page all the same (dragging the scrollbar, find in page)
 *   is put straight back.
 *
 *   A scrollbar that floats over the page (phones, macOS): `overflow:
 *   hidden` on <html>, as there is no room to keep. iOS has honoured this
 *   since iOS 16, and the sticky header and the browser's toolbars stay
 *   exactly where they were. Only <html>, never <body> as well: with both
 *   hidden, the body becomes a scrolling box of its own and the sticky header
 *   stops sticking to the screen. (An earlier version pinned <body> with
 *   `position: fixed`; on iPhone Chrome that dropped the header below a blank
 *   strip.)
 *
 * Either way the scrollbar's width is published as --scrollbar-gap on
 * <html> while locked, for anything fixed that lines up with the page's
 * content (the menu panel under the header's menu button).
 */

let locks = 0;
let release: (() => void) | null = null;

/** Keys that scroll the page, and which way: -1 up, 1 down. */
function keyDirection(event: KeyboardEvent): number {
  switch (event.key) {
    case "ArrowUp":
    case "PageUp":
    case "Home":
      return -1;
    case "ArrowDown":
    case "PageDown":
    case "End":
      return 1;
    case " ":
      return event.shiftKey ? -1 : 1;
    default:
      return 0;
  }
}

/** What Space presses rather than scrolls. */
const CONTROLS =
  "button, a[href], summary, label, [role=button], [role=link], [role=checkbox], [role=switch], [role=radio], [role=tab], [role=option], [role=menuitem]";

function isTyping(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))
  );
}

/**
 * Whether something between `target` and the page can still scroll by
 * (dx, dy) - so the gesture is that box's, not the page's. A box already at
 * its end in that direction does not count: the browser would hand the
 * scroll on to the page.
 */
export function scrollsWithin(target: EventTarget | null, dx: number, dy: number): boolean {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.body && element !== document.documentElement) {
    const style = getComputedStyle(element);
    if (dy !== 0 && /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
      const room = dy < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      if (room) return true;
    }
    if (dx !== 0 && /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth) {
      const room = dx < 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      if (room) return true;
    }
    element = element.parentElement;
  }
  return false;
}

/** Hold the page still with the scrollbar left in place. Returns the undo. */
function holdByEvents(): () => void {
  const x = window.scrollX;
  const y = window.scrollY;
  let touch: { x: number; y: number } | null = null;

  function onWheel(event: WheelEvent) {
    // Ctrl + wheel is the browser's zoom, not a scroll.
    if (event.ctrlKey) return;
    if (!scrollsWithin(event.target, event.deltaX, event.deltaY)) event.preventDefault();
  }
  function onKeyDown(event: KeyboardEvent) {
    const direction = keyDirection(event);
    if (direction === 0 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const active = document.activeElement;
    if (isTyping(active)) return;
    // Space presses a focused control (a button, a link, a tab): never take that from it.
    if (event.key === " " && active?.closest(CONTROLS)) return;
    if (!scrollsWithin(active, 0, direction)) event.preventDefault();
  }
  function onTouchStart(event: TouchEvent) {
    const point = event.touches[0];
    touch = point ? { x: point.clientX, y: point.clientY } : null;
  }
  function onTouchMove(event: TouchEvent) {
    const point = event.touches[0];
    if (!point || !touch || event.touches.length > 1) return;
    if (!scrollsWithin(event.target, touch.x - point.clientX, touch.y - point.clientY)) event.preventDefault();
  }
  // The scrollbar dragged, find in page, a jump to an anchor: put the page back.
  function onScroll() {
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  }

  const active = { passive: false, capture: true } as const;
  window.addEventListener("wheel", onWheel, active);
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  window.addEventListener("touchmove", onTouchMove, active);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("wheel", onWheel, active);
    window.removeEventListener("touchstart", onTouchStart, { capture: true });
    window.removeEventListener("touchmove", onTouchMove, active);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onScroll);
  };
}

/** Hold the page still by hiding its overflow (a floating scrollbar: nothing to keep). Returns the undo. */
function holdByOverflow(): () => void {
  const html = document.documentElement;
  const saved = html.style.overflow;
  html.style.overflow = "hidden";
  return () => {
    html.style.overflow = saved;
  };
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (locks === 0) {
      const html = document.documentElement;
      const scrollbar = window.innerWidth - html.clientWidth;
      const undo = scrollbar > 0 ? holdByEvents() : holdByOverflow();
      if (scrollbar > 0) html.style.setProperty("--scrollbar-gap", `${scrollbar}px`);
      release = () => {
        undo();
        html.style.removeProperty("--scrollbar-gap");
      };
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0) {
        release?.();
        release = null;
      }
    };
  }, [active]);
}
