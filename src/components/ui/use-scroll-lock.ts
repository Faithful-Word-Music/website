"use client";

import { useEffect } from "react";

/**
 * Locks the page while `active` - for overlays such as the mobile menu, the
 * search palette and dialogs.
 *
 * The page is never moved: `overflow: hidden` on <html> and <body> stops it
 * scrolling (iOS has honoured this since iOS 16), so the sticky header and
 * the browser's toolbars stay exactly where they were. An earlier version
 * pinned <body> with `position: fixed`; on iPhone Chrome, once the toolbar had
 * collapsed from scrolling, that dropped the header below a blank strip.
 *
 * On desktop, the scrollbar's width is kept as padding while it is hidden,
 * so nothing shifts sideways. Nested locks (a dialog over the menu) only
 * unlock when the last one closes.
 */
let locks = 0;
let saved: { htmlOverflow: string; bodyOverflow: string; bodyPadding: string } | null = null;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;
    if (locks === 0) {
      saved = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, bodyPadding: body.style.paddingRight };
      const scrollbar = window.innerWidth - html.clientWidth;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        html.style.overflow = saved.htmlOverflow;
        body.style.overflow = saved.bodyOverflow;
        body.style.paddingRight = saved.bodyPadding;
        saved = null;
      }
    };
  }, [active]);
}
