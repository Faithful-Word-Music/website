"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { Icon } from "@/components/ui/Icon";

/**
 * A row that opens what is under it - the next service's songs and readiness,
 * the rest of the For You list. The content is rendered by the server and
 * only shown or hidden here; closed, it is inert (out of the tab order and
 * away from screen readers), and the button says whether it is open.
 */
export function Disclosure({
  showLabel,
  hideLabel,
  summary,
  defaultOpen = false,
  buttonAfter = false,
  className,
  buttonClassName,
  children,
}: {
  showLabel: ReactNode;
  hideLabel: ReactNode;
  /** Beside the label while closed: what is inside ("5 songs"). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** The button under what it opens - for "See all", which continues a list. */
  buttonAfter?: boolean;
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const button = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((value) => !value)}
      className={cn(
        "group flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium text-ink-soft transition-colors hover:text-ink",
        buttonClassName,
      )}
    >
      <span className="shrink-0">{open ? hideLabel : showLabel}</span>
      {!open && summary ? <span className="hidden min-w-0 truncate font-normal text-muted sm:inline">{summary}</span> : null}
      <Icon
        name="chevron-down"
        size={14}
        strokeWidth={1.6}
        className={cn("ml-auto text-muted transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
      />
    </button>
  );
  return (
    <div className={className}>
      {buttonAfter ? null : button}
      <Collapse open={open} id={id}>
        {children}
      </Collapse>
      {buttonAfter ? button : null}
    </div>
  );
}
