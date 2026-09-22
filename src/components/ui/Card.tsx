import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Paper panel. The optional gold left edge reads as a barline - used on the
 * song-list service cards to separate one service from the next.
 */
export function Card({
  children,
  className,
  barline = false,
}: {
  children: ReactNode;
  className?: string;
  barline?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        barline && "border-l-2 border-l-gold",
        className,
      )}
    >
      {children}
    </div>
  );
}
