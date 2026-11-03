import { cn } from "./cn";

/**
 * A placeholder the shape of what is loading: a soft block that pulses
 * gently. Still under reduced motion. Hidden from screen readers - the
 * loading region itself should say it is busy (aria-busy, or a status line).
 *
 * Size it with `className` (h-4 w-32, h-24 w-full). `lines` draws that many
 * text-height bars instead, the last one shorter, for a paragraph.
 */
export function Skeleton({ className, lines }: { className?: string; lines?: number }) {
  const bar = "block animate-pulse rounded-control bg-line/70 motion-reduce:animate-none";
  if (lines && lines > 0) {
    return (
      <span aria-hidden="true" data-skeleton="" className={cn("block space-y-2", className)}>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={cn(bar, "h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
        ))}
      </span>
    );
  }
  return <span aria-hidden="true" data-skeleton="" className={cn(bar, className)} />;
}
