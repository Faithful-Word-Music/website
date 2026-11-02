"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/Menu";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** Three dots that open a short list of actions (the site's Menu), for one row. */
export function ActionMenu({ label, items, className }: { label: string; items: ActionMenuItem[]; className?: string }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  function close({ refocus = false } = {}) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  const entries: MenuItem[] = items.map((item, index) => ({ key: String(index), label: item.label, disabled: item.disabled }));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open ? true : undefined}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink aria-expanded:text-ink",
          className,
        )}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open ? (
        <Menu
          id={menuId}
          menuRef={menuRef}
          triggerRef={triggerRef}
          placement="below"
          items={entries}
          onSelect={(entry) => {
            close();
            items[Number(entry.key)]?.onSelect();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}
