import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * A link leaving the site. Always opens in a new tab, always safe against
 * reverse-tabnabbing, and always announces itself to screen readers.
 */
export function ExternalLink({
  href,
  children,
  className,
  showIcon = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("transition-colors", className)}
    >
      {children}
      {showIcon ? (
        <span aria-hidden="true" className="ml-1 inline-block">
          ↗
        </span>
      ) : null}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
