import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * A section that opens and closes smoothly, by animating its grid row between
 * 0 and its natural height. `inert` keeps the closed content out of the tab
 * order and away from screen readers. Whatever toggles it should carry
 * `aria-expanded` and `aria-controls={id}`.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      {/* `relative` matters: overflow only clips absolutely positioned
          descendants (such as screen-reader table headers) when the clipping
          box is itself positioned. Without it they escape the collapsed
          section and stretch the page below the footer. */}
      <div className="relative min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
