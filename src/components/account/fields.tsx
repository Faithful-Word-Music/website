"use client";

import { useState } from "react";

import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
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
  required = false,
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
  /** Announced as required (the server checks it too). */
  required?: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    "aria-required": required || undefined,
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
  tag,
  error,
  describe = false,
  explainLabel,
  required = false,
  onChange,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  /**
   * The options carry descriptions: an ⓘ beside the question opens them all,
   * and the chosen one's shows under the choices.
   */
  describe?: boolean;
  /** The ⓘ's label for screen readers; {question} is replaced. */
  explainLabel?: string;
  /** A required question: announced as required, and a chosen answer can be changed but not cleared. */
  required?: boolean;
  selected: readonly T[];
  multiple?: boolean;
  /** "Required" or "Optional", beside the question. */
  tag?: string;
  /** A field-level problem, read out with the group. */
  error?: string;
  onChange: (next: T[]) => void;
}) {
  const errorId = `${name}-error`;
  const explainId = `${name}-explain`;
  const [explaining, setExplaining] = useState(false);
  const described = describe ? options.filter((option) => option.description) : [];
  // The chosen answer's own description, under the choices - one line, never all of them at once.
  const chosen = !multiple && described.length > 0 ? described.find((option) => selected.includes(option.value)) : undefined;
  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} aria-required={required || undefined}>
      <legend className="mb-2 flex w-full items-center justify-between gap-3 text-sm font-medium text-ink">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0">{legend}</span>
          {described.length > 0 ? (
            <button
              type="button"
              aria-expanded={explaining}
              aria-controls={explainId}
              aria-label={(explainLabel ?? "What the choices mean: {question}").replace("{question}", legend)}
              onClick={() => setExplaining((open) => !open)}
              className={cn(
                "-my-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                explaining ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              <InfoIcon />
            </button>
          ) : null}
        </span>
        {tag ? <span className="shrink-0 text-xs font-normal text-muted">{tag}</span> : null}
      </legend>
      {hint ? <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p> : null}
      {described.length > 0 ? (
        <Collapse open={explaining} id={explainId}>
          <dl className="mb-3 space-y-2.5 rounded-lg border border-line bg-paper px-4 py-3">
            {described.map((option) => (
              <div key={String(option.value)}>
                <dt className="text-sm font-medium text-ink">{option.label}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-ink-soft">{option.description}</dd>
              </div>
            ))}
          </dl>
        </Collapse>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={String(option.value)}
              className={cn(
                // relative: holds its visually hidden input, so focusing it never scrolls a dialog (README).
                "relative inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors",
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
                    // Clicking the chosen option again clears an optional answer; a required one stays.
                    if (checked && required) return;
                    onChange(checked ? [] : [option.value]);
                  }
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {chosen ? (
        <p aria-live="polite" className="mt-2 text-sm leading-relaxed text-ink-soft">
          {chosen.description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-gold-dark">
          {error}
        </p>
      ) : null}
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
  placeholder,
  invalid = false,
}: {
  id: string;
  label: string;
  /** "" shows the placeholder: nothing chosen yet (never a stand-in answer). */
  value: T | "";
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value as T);
        }}
        className={cn(
          "min-h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink transition-colors hover:border-muted/50",
          invalid ? "border-gold-dark" : "border-line",
        )}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
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

/** A small "i" in a circle, drawn in the text colour. */
function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[1.125rem] w-[1.125rem]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v4.5" strokeLinecap="round" />
      <circle cx="10" cy="6.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
