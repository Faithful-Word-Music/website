"use client";

import { useEffect, useState, type RefObject } from "react";

import { useScrollLock } from "@/components/ui/use-scroll-lock";

/**
 * Every modal <dialog> on the site opens through this, so they all behave
 * alike. Mount the component that calls it to open; unmount it to close.
 *
 * - showModal() keeps focus inside and makes the page behind inert, and the
 *   page stops scrolling underneath (useScrollLock).
 * - Focus goes to the dialog itself, not to its first control. Left to the
 *   browser it lands on the close button - the first thing in every header -
 *   and shows that button's focus ring the moment the dialog opens, which on
 *   a phone looks like a stuck highlight. Tab still moves straight into the
 *   controls, and a screen reader still announces the dialog by its title.
 *   The dialog needs tabIndex={-1} and outline-none (modalDialogProps).
 * - On closing, focus returns to whatever opened it.
 *
 * A dialog whose whole purpose is typing (the song picker) may move focus on
 * into its field from its own effect, which runs after this one.
 */
export function useModalDialog(dialogRef: RefObject<HTMLDialogElement | null>) {
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useScrollLock(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [dialogRef, opener]);
}

/** What the <dialog> element needs for useModalDialog's focus. */
export const modalDialogProps = { tabIndex: -1 } as const;

/** The <dialog>'s own classes for that: focused, it never draws a ring. */
export const modalDialogFocusClasses = "outline-none focus-visible:outline-none";
