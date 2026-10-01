"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { dashboardContent } from "@/content/dashboard";

/**
 * A card's list: its first `limit` rows, then "Show all" at the bottom,
 * which opens every row in a dialog - so the card itself never changes size.
 */
export function ExpandableList({
  rows,
  limit,
  title,
  lead,
}: {
  rows: ReactNode[];
  limit: number;
  /** The dialog's heading: the card's own title and description. */
  title: string;
  lead?: string;
}) {
  const [open, setOpen] = useState(false);
  const { showAll } = dashboardContent.lists;

  return (
    <>
      <ul className="divide-y divide-line border-t border-line">{rows.slice(0, limit)}</ul>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="group mt-auto flex min-h-11 w-full items-center gap-1 border-t border-line px-5 text-left text-sm text-muted transition-colors hover:text-ink"
      >
        {showAll.replace("{count}", String(rows.length))}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </button>
      {open ? (
        <ListDialog title={title} lead={lead} onClose={() => setOpen(false)}>
          {rows}
        </ListDialog>
      ) : null}
    </>
  );
}

/**
 * Built on <dialog>, like the search palette: showModal() keeps focus inside
 * and the page behind inert; Escape, the close button or a click outside the
 * panel closes it, and focus returns to "Show all".
 */
function ListDialog({
  title,
  lead,
  onClose,
  children,
}: {
  title: string;
  lead?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useScrollLock(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 backdrop:bg-black/45 backdrop:backdrop-blur-[2px] sm:px-6 sm:pt-[10vh]"
    >
      <div className="animate-enter mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift sm:max-h-[75vh]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-2xl text-ink">
              {title}
            </h2>
            {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dashboardContent.lists.close}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <ul className="divide-y divide-line overflow-y-auto overscroll-contain">{children}</ul>
      </div>
    </dialog>
  );
}
