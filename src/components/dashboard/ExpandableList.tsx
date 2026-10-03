"use client";

import { useState, type ReactNode } from "react";

import { Modal } from "@/components/ui/Modal";
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

/** Every row, in the site's dialog (Modal); focus returns to "Show all". */
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
  return (
    <Modal title={title} subtitle={lead} closeLabel={dashboardContent.lists.close} onClose={onClose} size="lg" bare>
      <ul className="divide-y divide-line">{children}</ul>
    </Modal>
  );
}
