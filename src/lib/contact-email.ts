/**
 * The public contact form's emails, apart from sending them (src/lib/resend.ts):
 *
 *   contactIdempotencyKeys     the Resend idempotency keys of one submission
 *   safeEcho                   whether a visitor's words may be repeated to
 *                              the address they typed
 *   renderContactConfirmation  the visitor's "we received your message"
 *
 * THE RELAY RULE. The confirmation goes to whatever address was typed into
 * the form, so anything it repeats could be sent to a stranger. It never
 * repeats the message. It greets by name and names the subject - what anyone
 * expects - only when neither holds a link, an address or a domain; otherwise
 * it says "Hello," and leaves the subject out. A genuine visitor sees an
 * ordinary confirmation, and the form cannot carry a link to anyone.
 *
 * Pure (node:crypto only).
 */

import { createHash } from "node:crypto";

import { siteConfig } from "@/config/site";
import { contactContent } from "@/content/contact";
import { renderBrandedEmail, type RenderedEmail } from "@/lib/notifications/email";
import type { ContactFormValues } from "@/lib/validation";

type Submission = Pick<ContactFormValues, "name" | "email" | "subject" | "message" | "submissionKey">;

/**
 * One key per submission: the form's own key with what was written. The same
 * message sent again (a double click, a retry, a refresh) has the same keys,
 * and Resend delivers each once within a day. Different words make different
 * keys, so a reused form key can never collide with another message.
 */
export function contactIdempotencyKeys(values: Submission): { ministry: string; confirmation: string } {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        values.submissionKey ?? "",
        values.name.trim(),
        values.email.trim().toLowerCase(),
        values.subject.trim(),
        values.message.trim(),
      ]),
    )
    .digest("hex")
    .slice(0, 40);
  return { ministry: `contact-ministry/${digest}`, confirmation: `contact-confirmation/${digest}` };
}

/** Anything that could carry someone somewhere: a scheme, www., an @, or a domain ("example.com"). */
const LINKISH = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|@|[a-z0-9-]+\.[a-z]{2,}\b)/i;
/** Control characters, line breaks included. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A visitor's short text, tidied, when it is safe to repeat to the address they gave; otherwise null. */
export function safeEcho(text: string | undefined | null): string | null {
  if (typeof text !== "string") return null;
  if (CONTROL.test(text)) return null;
  const tidy = text.replace(/\s+/g, " ").trim();
  if (tidy === "" || LINKISH.test(tidy)) return null;
  return tidy;
}

/** The visitor's confirmation: their own name and subject when safe, never their message. */
export function renderContactConfirmation(values: Pick<ContactFormValues, "name" | "subject">): RenderedEmail {
  const copy = contactContent.confirmation;
  const name = safeEcho(values.name);
  const subject = safeEcho(values.subject);
  const { text, html } = renderBrandedEmail({
    heading: copy.heading,
    paragraphs: [
      // Replaced by a function, so a "$&" in what was typed is kept as written.
      name ? copy.greeting.replace("{name}", () => name) : copy.greetingFallback,
      copy.body,
      subject ? copy.subjectLine.replace("{subject}", () => subject) : "",
      copy.replyNote,
      copy.signOff,
    ],
    button: null,
    footer: { text: copy.footer },
  });
  return { subject: `${copy.subject} - ${siteConfig.name}`, text, html };
}
