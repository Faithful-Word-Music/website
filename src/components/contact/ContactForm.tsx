"use client";

import { useId, useState } from "react";

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

const EMPTY = { name: "", email: "", subject: "", message: "" };

export function ContactForm() {
  const ids = useId();
  const [values, setValues] = useState(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const { form, status: statusCopy } = contactContent;

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
      const first = (["name", "email", "subject", "message"] as const).find(
        (field) => fieldErrors[field],
      );
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
        onChange={(value) => update("message", value)}
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

      <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">{form.optionalNote}</p>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? form.submitting : form.submit}
        </Button>
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
  onChange,
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
        <textarea {...shared} rows={7} autoComplete={autoComplete} />
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
