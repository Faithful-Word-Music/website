"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { accountContent } from "@/content/account";
import {
  ACCOUNT_REQUEST_LIMITS,
  accountRequestSchema,
  type AccountRequestField,
  type AccountRequestResponse,
} from "@/lib/validation";

type Values = Record<AccountRequestField, string>;
const EMPTY: Values = { name: "", email: "", message: "" };
const FIELDS = ["name", "email", "message"] as const;

/**
 * The account request form. Submitting it creates a request for an
 * administrator to review - never an account.
 */
export function RequestAccessForm() {
  const ids = useId();
  const copy = accountContent.requestAccess;
  const [values, setValues] = useState(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Partial<Values>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: AccountRequestField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
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

    const parsed = accountRequestSchema.safeParse({ ...values, website: honeypot });
    if (!parsed.success) {
      const fieldErrors: Partial<Values> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in fieldErrors)) {
          fieldErrors[field as AccountRequestField] = issue.message;
        }
      }
      setErrors(fieldErrors);
      const first = FIELDS.find((field) => fieldErrors[field]);
      if (first) document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch("/api/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await response.json()) as AccountRequestResponse;
      if (!response.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        setFormError(data.error ?? copy.errorBody);
        setStatus("error");
        return;
      }
      setValues(EMPTY);
      setStatus("success");
    } catch {
      setFormError(copy.errorBody);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="p-2 text-center">
        <p className="font-display text-xl text-ink">{copy.success.title}</p>
        <p className="mx-auto mt-3 max-w-sm text-muted">{copy.success.body}</p>
        <p className="mt-6 text-sm text-muted">
          {copy.haveAccount}{" "}
          <Link href="/login" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
            {copy.loginLink}
          </Link>
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";
  const { form } = copy;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <div role="alert" className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink">
          <p className="font-medium">{copy.errorTitle}</p>
          <p className="mt-1 text-muted">{formError}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id={`${ids}-name`}
          label={form.name.label}
          placeholder={form.name.placeholder}
          value={values.name}
          error={errors.name}
          maxLength={ACCOUNT_REQUEST_LIMITS.name}
          autoComplete="name"
          onChange={(value) => update("name", value)}
        />
        <TextField
          id={`${ids}-email`}
          label={form.email.label}
          placeholder={form.email.placeholder}
          value={values.email}
          error={errors.email}
          maxLength={ACCOUNT_REQUEST_LIMITS.email}
          type="email"
          autoComplete="email"
          onChange={(value) => update("email", value)}
        />
      </div>

      <TextField
        id={`${ids}-message`}
        label={form.message.label}
        hint={form.message.optional}
        placeholder={form.message.placeholder}
        value={values.message}
        error={errors.message}
        maxLength={ACCOUNT_REQUEST_LIMITS.message}
        multiline
        onChange={(value) => update("message", value)}
      />

      {/* Honeypot, as on the contact form. */}
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

      <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted">{form.note}</p>
        <Button
          type="submit"
          size="lg"
          state={submitting ? "pending" : "idle"}
          pendingLabel={form.submitting}
          className="shrink-0"
        >
          {form.submit}
        </Button>
      </div>
    </form>
  );
}
