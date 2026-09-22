import "server-only";

import { Resend } from "resend";

import { siteConfig } from "@/config/site";
import type { ContactFormValues } from "@/lib/validation";

/**
 * Reusable Resend setup.
 *
 * RESEND_API_KEY is read only here, only on the server, and is never returned,
 * logged or included in any response. It is deliberately not a NEXT_PUBLIC_
 * variable, so it is never bundled for the browser.
 */

let client: Resend | null = null;

/** The Resend client, or null when the key is not configured. */
function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  // Created lazily and reused across invocations on a warm instance.
  client ??= new Resend(apiKey);
  return client;
}

/** True when the contact form can actually send. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "send-failed" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sends one contact-form submission to the ministry inbox.
 *
 * Addressing matters here:
 *   From:     the site's own verified address  (never the visitor's - that
 *             would be spoofing, and would fail SPF/DKIM)
 *   To:       the ministry inbox
 *   Reply-To: the visitor, so hitting reply answers them directly
 */
export async function sendContactEmail(
  values: ContactFormValues,
): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };

  const { name, email, subject, message } = values;

  const text = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Subject: ${subject}`,
    "",
    message,
  ].join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;line-height:1.6">
      <p style="margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin:0 0 4px"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="margin:0 0 16px"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <hr style="border:none;border-top:1px solid #e5e5e2;margin:0 0 16px" />
      <p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>
  `.trim();

  try {
    const { error } = await resend.emails.send({
      from: siteConfig.mail.from,
      to: [siteConfig.mail.to],
      replyTo: email,
      subject: `[${siteConfig.name}] ${subject}`,
      text,
      html,
    });

    if (error) {
      // Log the failure reason only - never the visitor's message contents.
      console.error("[contact] Resend rejected the message:", error.message);
      return { ok: false, reason: "send-failed" };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[contact] Could not reach Resend:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed" };
  }
}
