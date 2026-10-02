"use client";

import { useEffect } from "react";

/**
 * Locks the page while `active` - for overlays such as the mobile menu, the
 * search palette and dialogs.
 *
 * The page is never moved: `overflow: hidden` on <html> stops it scrolling
 * (iOS has honoured this since iOS 16), so the sticky header and the
 * browser's toolbars stay exactly where they were. An earlier version pinned
 * <body> with `position: fixed`; on iPhone Chrome, once the toolbar had
 * collapsed from scrolling, that dropped the header below a blank strip.
 *
 * Only <html>, never <body> as well. With both hidden, the body's overflow is
 * no longer handed to the window, so the body becomes a scrolling box of its
 * own - and the sticky header, which sticks to its nearest scrolling box,
 * stops sticking to the screen and jumps back to the top of the page. On a
 * scrolled page that left the mobile menu under a strip of page content where
 * the header should be.
 *
 * On desktop, the scrollbar's width is kept as padding while it is hidden,
 * so nothing shifts sideways. Nested locks (a dialog over the menu) only
 * unlock when the last one closes.
 */
let locks = 0;
let saved: { htmlOverflow: string; bodyPadding: string } | null = null;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;
    if (locks === 0) {
      saved = { htmlOverflow: html.style.overflow, bodyPadding: body.style.paddingRight };
      const scrollbar = window.innerWidth - html.clientWidth;
      html.style.overflow = "hidden";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        html.style.overflow = saved.htmlOverflow;
        body.style.paddingRight = saved.bodyPadding;
        saved = null;
      }
    };
  }, [active]);
}
