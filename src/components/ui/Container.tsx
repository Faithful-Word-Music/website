import type { ReactNode } from "react";

import { cn } from "./cn";

/** Consistent page gutter and max width. Every section uses this. */
export function Container({
  children,
  className,
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  size?: "default" | "narrow" | "wide";
}) {
  const width =
    size === "narrow" ? "max-w-3xl" : size === "wide" ? "max-w-7xl" : "max-w-5xl";

  return (
    <div className={cn("mx-auto w-full px-5 sm:px-8", width, className)}>
      {children}
    </div>
  );
}
