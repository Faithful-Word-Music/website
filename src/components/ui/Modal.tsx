"use client";

import { useId, useRef, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { modalDialogFocusClasses, modalDialogProps, useModalDialog } from "@/components/ui/use-modal-dialog";

/**
 * The site's dialog: a titled panel over the dimmed page, built on <dialog>
 * (useModalDialog). Escape, the close button or a click outside the panel
 * closes it. Render it to open it, and stop rendering it to close.
 *
 * `children` sits in a padded, scrolling body; `bare` drops the padding and
 * spacing for content that brings its own rows (a divided list).
 */
export function Modal({
  title,
  subtitle,
  closeLabel,
  onClose,
  footer,
  size = "md",
  bare = false,
  bodyClassName,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  footer?: ReactNode;
  /** md: forms and help (32rem); lg: lists (36rem). */
  size?: "md" | "lg";
  bare?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useModalDialog(dialogRef);

  return (
    <dialog
      ref={dialogRef}
      {...modalDialogProps}
      aria-labelledby={headingId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 backdrop:bg-black/45 backdrop:backdrop-blur-[2px] sm:px-6 sm:pt-[10vh]",
        modalDialogFocusClasses,
      )}
    >
      <div
        className={cn(
          "animate-enter mx-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift sm:max-h-[80vh]",
          size === "lg" ? "max-w-xl" : "max-w-lg",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-2xl text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={cn("overflow-y-auto overscroll-contain", !bare && "space-y-6 px-5 py-5", bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>
        ) : null}
      </div>
    </dialog>
  );
}
