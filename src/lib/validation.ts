import { z } from "zod";

import { accountContent } from "@/content/account";
import { contactContent } from "@/content/contact";

const { errors } = contactContent;

/** Field length caps, enforced identically on the client and the server. */
export const CONTACT_LIMITS = {
  name: 80,
  email: 254,
  subject: 120,
  message: 4000,
} as const;

/**
 * The single contact-form schema, shared by the browser form and the API route.
 *
 * The server always re-validates: client-side checks are a convenience, never a
 * security boundary.
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, errors.nameRequired)
    .max(CONTACT_LIMITS.name, errors.nameTooLong),

  email: z
    .string()
    .trim()
    .min(1, errors.emailRequired)
    .max(CONTACT_LIMITS.email, errors.emailTooLong)
    .pipe(z.email(errors.emailInvalid)),

  subject: z
    .string()
    .trim()
    .min(1, errors.subjectRequired)
    .max(CONTACT_LIMITS.subject, errors.subjectTooLong),

  message: z
    .string()
    .trim()
    .min(1, errors.messageRequired)
    .max(CONTACT_LIMITS.message, errors.messageTooLong),

  /**
   * Honeypot. Hidden from sighted users and from assistive technology, so a
   * real visitor never fills it in. Anything here means a bot.
   */
  website: z.string().max(0).optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

/** Field names used by the form and the API route. */
export type ContactField = "name" | "email" | "subject" | "message";

/** Shape returned by POST /api/contact. */
export interface ContactResponse {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<ContactField, string>>;
}

// ---------------------------------------------------------------------------
// Account requests (/request-access)
// ---------------------------------------------------------------------------

const accountErrors = accountContent.errors;

export const ACCOUNT_REQUEST_LIMITS = {
  name: 80,
  email: 254,
  message: 1000,
} as const;

/** Shared by the request form and POST /api/account-requests. */
export const accountRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, accountErrors.nameRequired)
    .max(ACCOUNT_REQUEST_LIMITS.name, accountErrors.nameTooLong),

  email: z
    .string()
    .trim()
    .min(1, accountErrors.emailRequired)
    .max(ACCOUNT_REQUEST_LIMITS.email, accountErrors.emailTooLong)
    .pipe(z.email(accountErrors.emailInvalid)),

  message: z.string().trim().max(ACCOUNT_REQUEST_LIMITS.message, accountErrors.messageTooLong).default(""),

  /** Honeypot, as on the contact form. */
  website: z.string().max(0).optional(),
});

export type AccountRequestValues = z.infer<typeof accountRequestSchema>;
export type AccountRequestField = "name" | "email" | "message";

/** Shape returned by POST /api/account-requests. */
export interface AccountRequestResponse {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<AccountRequestField, string>>;
}
