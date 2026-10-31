import "server-only";

import { Resend } from "resend";

import { siteConfig } from "@/config/site";
import { accountContent } from "@/content/account";
import { renderContactConfirmation } from "@/lib/contact-email";
import type { ProviderSendResult } from "@/lib/email-retry";
import { escapeHtml } from "@/lib/html";
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
  idempotencyKey: string,
): Promise<ProviderSendResult> {
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
    const { error } = await resend.emails.send(
      {
        from: siteConfig.mail.from,
        to: [siteConfig.mail.to],
        replyTo: email,
        subject: `[${siteConfig.name}] ${subject}`,
        text,
        html,
      },
      // The same submission sent again is recognised by Resend and delivered once.
      { idempotencyKey },
    );

    if (error) {
      // The reason only - never the visitor's message contents, never the key.
      // `name` and `statusCode` are what make this diagnosable at a glance in
      // the Vercel logs: "validation_error (403)" is almost always a sending
      // domain that has not been verified, which reads very differently from
      // "invalid_access (401)", a bad or revoked API key.
      console.error(
        "[contact] Resend rejected the message:",
        `${error.name} (${error.statusCode ?? "no status"}) - ${error.message}`,
      );
      return { ok: false, reason: "send-failed", statusCode: error.statusCode ?? null, name: error.name ?? null };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[contact] Could not reach Resend:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed", statusCode: null, name: null };
  }
}

/**
 * Emails the visitor a short "we received your message" note
 * (renderContactConfirmation, src/lib/contact-email.ts).
 *
 * Only called after the ministry's copy has gone out, so a visitor is never
 * told a message arrived when it did not. Their message is never echoed back,
 * and their name and subject only when they carry no link or address - so the
 * form cannot be used to send anything of use to a spammer to a stranger.
 *
 * From is the site's verified address (named Faithful Word Music); Reply-To is
 * the ministry inbox, so answering the confirmation still reaches someone.
 */
export async function sendContactConfirmation(
  values: ContactFormValues,
  idempotencyKey: string,
): Promise<ProviderSendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };
  // The schema requires one; this only guards a caller that skipped it.
  if (!values.email?.trim()) return { ok: false, reason: "no-address" };

  const { subject, text, html } = renderContactConfirmation(values);

  try {
    const { error } = await resend.emails.send(
      {
        from: siteConfig.mail.from,
        to: [values.email.trim()],
        replyTo: siteConfig.mail.to,
        subject,
        text,
        html,
      },
      { idempotencyKey },
    );

    if (error) {
      console.error(
        "[contact] Resend rejected the confirmation:",
        `${error.name} (${error.statusCode ?? "no status"}) - ${error.message}`,
      );
      return { ok: false, reason: "send-failed", statusCode: error.statusCode ?? null, name: error.name ?? null };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[contact] Could not reach Resend for the confirmation:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed", statusCode: null, name: null };
  }
}

/**
 * Sends a short plain-text alert to whoever looks after the site - used when
 * something that runs unattended (the nightly archive sync) goes wrong.
 * Goes to siteConfig.songList.alertEmail. Never throws: a failed alert is
 * logged, and must not hide the problem it was reporting.
 */
export async function sendAlertEmail(subject: string, text: string): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };

  try {
    const { error } = await resend.emails.send({
      from: siteConfig.mail.from,
      to: [siteConfig.songList.alertEmail],
      subject: `[${siteConfig.name}] ${subject}`,
      text,
    });

    if (error) {
      console.error(
        "[alert] Resend rejected the alert:",
        `${error.name} (${error.statusCode ?? "no status"}) - ${error.message}`,
      );
      return { ok: false, reason: "send-failed" };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[alert] Could not reach Resend:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed" };
  }
}

/**
 * Sends the music director's quarterly report (see src/lib/quarterly-report.ts).
 * It always goes to the ministry inbox, siteConfig.mail.to, and takes no
 * recipient: the report is for the music director alone. Never throws.
 */
export async function sendReportEmail(message: {
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };

  try {
    const { error } = await resend.emails.send({
      from: siteConfig.mail.from,
      to: [siteConfig.mail.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      console.error(
        "[report] Resend rejected the report:",
        `${error.name} (${error.statusCode ?? "no status"}) - ${error.message}`,
      );
      return { ok: false, reason: "send-failed" };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[report] Could not reach Resend:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed" };
  }
}

/**
 * Tells the ministry that someone asked for an account (see
 * src/app/api/account-requests/route.ts).
 *
 * The only link is to the review page, which needs an administrator to log
 * in. Nothing in this email approves, declines or changes anything, so a
 * forwarded or intercepted copy cannot be used to grant access. Never throws.
 */
export async function sendAccountRequestEmail(request: {
  name: string;
  email: string;
  message: string;
  reviewUrl: string;
  /** True outside Production, so a test request is never mistaken for a real one. */
  isTest: boolean;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };

  const copy = accountContent.notification;
  const prefix = request.isTest ? "[Test] " : "";
  const message = request.message || "(no message)";

  const text = [
    copy.intro,
    "",
    `Name:    ${request.name}`,
    `Email:   ${request.email}`,
    "",
    message,
    "",
    `${copy.review}: ${request.reviewUrl}`,
    "",
    copy.footer,
  ].join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;line-height:1.6">
      <p style="margin:0 0 16px">${escapeHtml(copy.intro)}</p>
      <p style="margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(request.name)}</p>
      <p style="margin:0 0 16px"><strong>Email:</strong> ${escapeHtml(request.email)}</p>
      <hr style="border:none;border-top:1px solid #e5e5e2;margin:0 0 16px" />
      <p style="margin:0 0 24px;white-space:pre-wrap">${escapeHtml(message)}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(request.reviewUrl)}" style="display:inline-block;background:#111;color:#faf9f6;padding:10px 20px;border-radius:999px;text-decoration:none">${escapeHtml(copy.review)}</a></p>
      <p style="margin:0;font-size:13px;color:#6b6b68">${escapeHtml(copy.footer)}</p>
    </div>
  `.trim();

  try {
    const { error } = await resend.emails.send({
      from: siteConfig.mail.from,
      to: [siteConfig.accounts.notifyEmail],
      // Replying goes to the person who asked.
      replyTo: request.email,
      subject: `${prefix}[${siteConfig.name}] ${copy.subject.replace("{name}", request.name)}`,
      text,
      html,
    });

    if (error) {
      console.error(
        "[account-request] Resend rejected the notification:",
        `${error.name} (${error.statusCode ?? "no status"}) - ${error.message}`,
      );
      return { ok: false, reason: "send-failed" };
    }

    return { ok: true };
  } catch (caught) {
    console.error(
      "[account-request] Could not reach Resend:",
      caught instanceof Error ? caught.message : "unknown error",
    );
    return { ok: false, reason: "send-failed" };
  }
}

export type NotificationSendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "refused"; statusCode: number | null; name: string | null };

/**
 * Sends one notification email (src/lib/notifications/email-delivery.ts),
 * from the site's verified address. `idempotencyKey` goes to Resend as the
 * Idempotency-Key header: the same key sent again within a day is recognised
 * and not delivered twice. One attempt; retrying is the caller's. Throws only
 * when Resend cannot be reached at all.
 */
export async function sendNotificationEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}): Promise<NotificationSendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: "not-configured" };

  const { data, error } = await resend.emails.send(
    {
      from: siteConfig.mail.from,
      to: message.to,
      // Answering any notification (a support acknowledgment, say) reaches the monitored ministry inbox.
      replyTo: siteConfig.mail.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    },
    { idempotencyKey: message.idempotencyKey },
  );
  if (error) {
    // The name and status only: never the address, never the message.
    console.error(`[resend] Notification email failed: ${error.name} (${error.statusCode ?? "no status"})`);
    return { ok: false, reason: "refused", statusCode: error.statusCode ?? null, name: error.name ?? null };
  }
  return { ok: true, id: data?.id ?? null };
}
