"use client";

import { cn } from "@/components/ui/cn";

/**
 * A native <select> styled as a pill to sit beside the search box (period,
 * sort order). Native keeps it accessible and gives phones their own
 * picker.
 */
export function PillSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: {
  id: string;
  /** Accessible name; not shown, since the options describe themselves. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(
          "glass min-h-11 w-full appearance-none rounded-full pl-4 pr-9 text-sm transition-shadow duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          value === "" ? "text-muted" : "text-ink",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

