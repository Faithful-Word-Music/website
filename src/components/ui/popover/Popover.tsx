"use client";

import { useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "../cn";

import type { Placement } from "./position";
import { usePopover, type DismissReason } from "./usePopover";

/**
 * A floating panel against the control that opened it, on the site's card
 * surface. Mount it to open it; it calls `onClose` with why it should close
 * (usePopover.ts), and Escape has already put focus back on the control by
 * then.
 *
 * Give it the role its content needs, and the control the matching
 * attributes - Popover adds none of its own:
 *
 *   links behind a button (disclosure)  no role; the button has
 *                                       aria-expanded + aria-controls={id}
 *   a panel to read (notifications)     role="dialog" + aria-label, and
 *                                       initialFocus="container"
 *   a menu of actions                   use Menu.tsx, which builds on the
 *                                       same mechanics
 */
export function Popover({
  id,
  triggerRef,
  onClose,
  placement = "bottom-end",
  portal = false,
  initialFocus = "none",
  closeOnTab = false,
  fallbackFocus,
  className,
  children,
  ...rest
}: {
  id: string;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: (reason: DismissReason) => void;
  placement?: Placement;
  portal?: boolean;
  initialFocus?: "first" | "container" | "none";
  closeOnTab?: boolean;
  fallbackFocus?: () => HTMLElement | null;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "id" | "className" | "children" | "style">) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const { container, style, placed } = usePopover({
    triggerRef,
    popoverRef,
    placement,
    portal,
    initialFocus,
    itemSelector: "a[href], button:not([disabled])",
    closeOnTab,
    fallbackFocus,
    onDismiss(reason) {
      if (reason === "escape") triggerRef.current?.focus({ preventScroll: true });
      onClose(reason);
    },
  });

  const panel = (
    <div
      {...rest}
      id={id}
      ref={popoverRef}
      data-popover=""
      style={style}
      className={cn(
        "z-50 rounded-card border border-line bg-surface shadow-lift outline-none",
        placed && "animate-enter",
        className,
      )}
    >
      {children}
    </div>
  );

  if (!portal) return panel;
  return container ? createPortal(panel, container) : null;
}
