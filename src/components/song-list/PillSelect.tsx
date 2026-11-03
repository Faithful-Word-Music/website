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
          // The chevron and the open list are the site's shared dropdown (globals.css).
          "glass min-h-11 w-full cursor-pointer rounded-full pl-4 text-sm transition-[border-color,box-shadow] duration-200 hover:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          value === "" ? "text-muted" : "text-ink",
        )}
      >
        {options.map((option) => (
          // Solid colours: an option otherwise inherits the pill's see-through
          // background, which some browsers draw as a grey list.
          <option key={option.value} value={option.value} className="bg-surface text-ink">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

