import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

import { contactContent } from "@/content/contact";
import { sendContactConfirmation, sendContactEmail } from "@/lib/resend";
import {
  contactFormSchema,
  type ContactField,
  type ContactResponse,
} from "@/lib/validation";

/**
 * POST /api/contact
 *
 * Validates a contact submission on the server and hands it to Resend.
 *
 * Client-side validation is a convenience only; everything is re-checked here,
 * because a request can be made without ever loading the form. Responses stay
 * generic: no stack traces, no environment values, no Resend detail.
 *
 * Three layers stand in front of a spam submission: Vercel BotID below, the
 * honeypot further down, and a WAF rate-limit rule configured in the Vercel
 * dashboard (see README).
 */
export async function POST(request: Request): Promise<NextResponse<ContactResponse>> {
  // BotID first, before the body is even read: the verdict is about the
  // request itself, so there is no point parsing something already rejected.
  // The matching route list lives in src/instrumentation-client.ts - a route
  // checked here but missing there always reads as a bot.
  //
  // Under `next dev` this always returns isBot: false; real detection only
  // happens on a Vercel deployment.
  const verification = await checkBotId();

  if (verification.isBot) {
    return NextResponse.json(
      { ok: false, error: contactContent.status.botBody },
      { status: 403 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: contactContent.status.errorBody },
      { status: 400 },
    );
  }

  // Honeypot: a hidden field no human ever fills in. Answer 200 so a bot
  // cannot tell the difference and learn to work around it. Nothing is sent.
  const candidate = payload as Record<string, unknown> | null;
  const honeypot = candidate?.website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = contactFormSchema.safeParse(payload);

  if (!parsed.success) {
    const fieldErrors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as ContactField] = issue.message;
      }
    }

    return NextResponse.json(
      { ok: false, error: contactContent.status.errorTitle, fieldErrors },
      { status: 400 },
    );
  }

  const result = await sendContactEmail(parsed.data);

  if (!result.ok) {
    // 503 when the site is not wired up yet, 502 when Resend itself failed.
    // The visitor sees the same neutral message either way.
    return NextResponse.json(
      { ok: false, error: contactContent.status.errorBody },
      { status: result.reason === "not-configured" ? 503 : 502 },
    );
  }

  // Best effort: the ministry already has the message, so a failed
  // confirmation is logged (inside the helper) but still reported as success.
  await sendContactConfirmation(parsed.data);

  return NextResponse.json({ ok: true }, { status: 200 });
}
