"use client";

import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/StatusIcons";

/** A labelled input or textarea in the site's form style (see ContactForm). */
export function TextField({
  id,
  label,
  hint,
  placeholder,
  value,
  error,
  maxLength,
  type = "text",
  autoComplete,
  multiline = false,
  rows = 5,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  error?: string;
  maxLength: number;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    value,
    placeholder,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    className: cn(
      "w-full rounded-lg border bg-surface px-4 py-3 text-base text-ink placeholder:text-muted transition-colors",
      error ? "border-gold-dark" : "border-line hover:border-muted/50",
    ),
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        {label}
        {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
      </label>
      {multiline ? (
        <textarea {...shared} rows={rows} autoComplete={autoComplete} />
      ) : (
        <input {...shared} type={type} autoComplete={autoComplete} />
      )}
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-gold-dark">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A group of pill-shaped choices - one (radio) or several (checkbox). Native
 * inputs underneath, so keyboard and screen readers work as expected.
 */
export function ChoiceChips<T extends string | number>({
  name,
  legend,
  hint,
  options,
  selected,
  multiple = false,
  onChange,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: readonly T[];
  multiple?: boolean;
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={String(option.value)}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/40",
                checked ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => {
                  if (multiple) {
                    onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value]);
                  } else {
                    // Clicking the chosen option again clears it: every question is optional.
                    onChange(checked ? [] : [option.value]);
                  }
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A small native select in the site's field style. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-muted/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The success / failure line shown after a form or button action. */
export function ActionMessage({ result }: { result: { ok: boolean; message?: string; error?: string } | null }) {
  if (!result) return null;
  const text = result.ok ? result.message : result.error;
  if (!text) return null;
  // Done reads as done: a tick and ink, never the muted grey of a hint. A
  // failure shakes once ("that did not happen").
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("flex items-start gap-1.5 text-sm", result.ok ? "animate-enter text-ink" : "animate-shake text-gold-dark")}
    >
      {result.ok ? <CheckIcon className="mt-0.5 text-gold-dark" /> : null}
      <span>{text}</span>
    </p>
  );
}
