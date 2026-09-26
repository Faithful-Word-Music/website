"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { contactContent } from "@/content/contact";
import {
  CONTACT_LIMITS,
  contactFormSchema,
  type ContactField,
  type ContactResponse,
} from "@/lib/validation";

type Status = "idle" | "submitting" | "success" | "error";
type Values = Record<ContactField, string>;

const EMPTY: Values = { name: "", email: "", subject: "", message: "" };
const FIELDS = ["name", "email", "subject", "message"] as const;

/**
 * Unsent drafts are kept in this browser only, so a refresh or a stray click
 * away does not lose a long message. Storage can be missing or blocked
 * (private windows, strict settings), so every access is allowed to fail -
 * the form simply works without it. The honeypot is never saved.
 */
const DRAFT_KEY = "fwm-contact-draft";
const DRAFT_SAVE_DELAY_MS = 400;

function readDraft(): Values | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const draft = { ...EMPTY };
    for (const field of FIELDS) {
      const value = stored[field];
      if (typeof value === "string") {
        draft[field] = value.slice(0, CONTACT_LIMITS[field]);
      }
    }
    return FIELDS.some((field) => draft[field].trim()) ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(values: Values) {
  try {
    if (FIELDS.some((field) => values[field].trim())) {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } else {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    // Storage unavailable - drafts just are not kept.
  }
}

const noopSubscribe = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere (and during server render). */
function useShortcutKey(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function ContactForm() {
  const ids = useId();
  const [values, setValues] = useState(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  // Saving waits until any stored draft has been read, so the empty initial
  // values never overwrite it.
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const shortcutKey = useShortcutKey();

  const { form, status: statusCopy } = contactContent;

  // Restore after hydration rather than in the initial state, so the first
  // browser render matches the server's HTML.
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues(draft);
      setDraftRestored(true);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => writeDraft(values), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, draftLoaded]);

  const hasContent = FIELDS.some((field) => values[field] !== "");

  /** Empties every field and forgets the saved draft. */
  function clearForm() {
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
    setDraftRestored(false);
    writeDraft(EMPTY);
    document.getElementById(`${ids}-name`)?.focus();
  }

  function update(field: ContactField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a field's error as soon as the visitor starts correcting it.
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Same schema the server uses - here purely so mistakes are caught before
    // a round trip. The server never trusts this.
    const parsed = contactFormSchema.safeParse({ ...values, website: honeypot });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<ContactField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in fieldErrors)) {
          fieldErrors[field as ContactField] = issue.message;
        }
      }
      setErrors(fieldErrors);
      // Move focus to the first field that needs attention.
      const first = FIELDS.find((field) => fieldErrors[field]);
      if (first) document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = (await response.json()) as ContactResponse;

      if (!response.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        setFormError(data.error ?? statusCopy.errorBody);
        setStatus("error");
        return;
      }

      setValues(EMPTY);
      setErrors({});
      setDraftRestored(false);
      // Cleared straight away, not via the debounced save, so leaving the
      // page right after sending cannot bring the old message back.
      writeDraft(EMPTY);
      setStatus("success");
    } catch {
      setFormError(statusCopy.errorBody);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-card border border-line bg-surface p-8 text-center shadow-card"
      >
        <p className="font-display text-xl text-ink">{statusCopy.successTitle}</p>
        <p className="mx-auto mt-3 max-w-sm text-muted">{statusCopy.successBody}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-6"
          onClick={() => setStatus("idle")}
        >
          {statusCopy.sendAnother}
        </Button>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <div
          role="alert"
          className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink"
        >
          <p className="font-medium">{statusCopy.errorTitle}</p>
          <p className="mt-1 text-muted">{formError}</p>
        </div>
      ) : null}

      {draftRestored ? <p className="text-sm text-muted">{form.draftRestored}</p> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={`${ids}-name`}
          label={form.name.label}
          placeholder={form.name.placeholder}
          value={values.name}
          error={errors.name}
          maxLength={CONTACT_LIMITS.name}
          autoComplete="name"
          onChange={(value) => update("name", value)}
        />
        <Field
          id={`${ids}-email`}
          label={form.email.label}
          placeholder={form.email.placeholder}
          value={values.email}
          error={errors.email}
          maxLength={CONTACT_LIMITS.email}
          type="email"
          autoComplete="email"
          onChange={(value) => update("email", value)}
        />
      </div>

      <Field
        id={`${ids}-subject`}
        label={form.subject.label}
        placeholder={form.subject.placeholder}
        value={values.subject}
        error={errors.subject}
        maxLength={CONTACT_LIMITS.subject}
        onChange={(value) => update("subject", value)}
      />

      <Field
        id={`${ids}-message`}
        label={form.message.label}
        placeholder={form.message.placeholder}
        value={values.message}
        error={errors.message}
        maxLength={CONTACT_LIMITS.message}
        multiline
        showCount
        onChange={(value) => update("message", value)}
        onKeyDown={(event) => {
          // Ctrl/⌘ + Enter sends, through the same validation as the button.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (!submitting) event.currentTarget.form?.requestSubmit();
          }
        }}
      />

      {/* Honeypot. Hidden from sight AND from assistive technology, and skipped
          in the tab order, so only an automated submitter ever fills it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${ids}-website`}>Website</label>
        <input
          id={`${ids}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="min-w-0 text-xs leading-relaxed text-muted">
          {form.optionalNote}
          {/* Keyboard hint only where a keyboard is likely. */}
          <span className="hidden sm:block">
            {form.shortcutHint.replace("{key}", shortcutKey)}
          </span>
        </p>
        {/* The buttons keep their size and never wrap; the note gives way
            instead. Clear is always present - disabled while there is nothing
            to clear - so the row never shifts as the visitor types. */}
        <div className="flex shrink-0 gap-3 whitespace-nowrap">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={!hasContent || submitting}
            onClick={clearForm}
            className="disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-surface"
          >
            {form.clear}
          </Button>
          <Button type="submit" size="lg" disabled={submitting} className="flex-1 sm:flex-none">
            {submitting ? form.submitting : form.submit}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  placeholder,
  value,
  error,
  maxLength,
  type = "text",
  autoComplete,
  multiline = false,
  showCount = false,
  onChange,
  onKeyDown,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  maxLength: number;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
  /** Show a character counter once the value nears `maxLength`. */
  showCount?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const errorId = `${id}-error`;
  const countId = `${id}-count`;

  // Always visible but muted; turns gold, and is tied to the field for screen
  // readers, only from 95% of the limit - so it is not read out on every key.
  const count = value.length;
  const countUrgent = showCount && count >= maxLength * 0.95;

  const describedBy =
    [error ? errorId : null, countUrgent ? countId : null].filter(Boolean).join(" ") ||
    undefined;

  const shared = {
    id,
    value,
    placeholder,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    className: cn(
      "w-full rounded-lg border bg-surface px-4 py-3 text-base text-ink",
      "placeholder:text-muted transition-colors",
      error ? "border-gold-dark" : "border-line hover:border-muted/50",
    ),
  };

  return (
    <div className={multiline ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={7}
          autoComplete={autoComplete}
          onKeyDown={onKeyDown}
        />
      ) : (
        <input {...shared} type={type} autoComplete={autoComplete} />
      )}
      {error || showCount ? (
        <div className="mt-1.5 flex items-start justify-between gap-4">
          {error ? (
            <p id={errorId} className="text-sm text-gold-dark">
              {error}
            </p>
          ) : (
            <span />
          )}
          {showCount ? (
            <p
              id={countId}
              aria-live={countUrgent ? "polite" : "off"}
              className={cn(
                "shrink-0 text-xs tabular-nums",
                countUrgent ? "text-gold-dark" : "text-muted",
              )}
            >
              {contactContent.form.characterCount
                .replace("{count}", count.toLocaleString("en-US"))
                .replace("{limit}", maxLength.toLocaleString("en-US"))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
