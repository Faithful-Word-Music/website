import { cn } from "./cn";

/** "Working": a turning ring in the text's own colour. Still under reduced motion, where the label says it. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={cn("shrink-0 animate-spin", className)}
    >
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" />
    </svg>
  );
}

/** "Done": a tick that draws itself in (.animate-check, globals.css). */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      <path d="M3.5 8.5l3 3 6-7" pathLength={1} className="animate-check" />
    </svg>
  );
}
