import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

import { accountContent } from "@/content/account";
import { accountExistsForEmail, listInvitations } from "@/lib/auth/clerk";
import { normalizeEmail } from "@/lib/auth/request-status";
import { accountsStatus, siteOrigin } from "@/lib/auth/session";
import { createRequest } from "@/lib/auth/store";
import { accountRequestCreated } from "@/lib/notifications/events/account";
import { notifyBestEffort } from "@/lib/notifications/send";
import { sendAccountRequestEmail } from "@/lib/resend";
import {
  accountRequestSchema,
  type AccountRequestField,
  type AccountRequestResponse,
} from "@/lib/validation";

/**
 * POST /api/account-requests
 *
 * Records a request for an account. It never creates one: an administrator
 * reviews the request at /admin/requests, and approving it sends a Clerk
 * invitation.
 *
 * Built like /api/contact - BotID, a honeypot and server-side validation - and
 * rate-limited by a Vercel WAF rule (see README).
 *
 * Privacy: the reply is identical whether the address is new, already has an
 * account, already has an invitation or already has a request waiting. The
 * form therefore cannot be used to find out who has an account.
 */
export async function POST(request: Request): Promise<NextResponse<AccountRequestResponse>> {
  const copy = accountContent.requestAccess;

  const status = accountsStatus();
  if (!status.available) {
    return NextResponse.json({ ok: false, error: accountContent.unavailable.body }, { status: 503 });
  }

  // The matching entry lives in src/instrumentation-client.ts.
  const verification = await checkBotId();
  if (verification.isBot) {
    return NextResponse.json({ ok: false, error: copy.botBody }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: copy.errorBody }, { status: 400 });
  }

  const honeypot = (payload as Record<string, unknown> | null)?.website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = accountRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<AccountRequestField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as AccountRequestField] = issue.message;
      }
    }
    return NextResponse.json({ ok: false, error: copy.errorTitle, fieldErrors }, { status: 400 });
  }

  const { name, email, message } = parsed.data;
  const emailNormalized = normalizeEmail(email);

  try {
    // Already has an account, or an invitation on the way: nothing to do.
    // If Clerk cannot be reached, the request is recorded anyway and the
    // administrator sees it - better than losing it.
    const existing = await accountExistsForEmail(emailNormalized);
    if (existing.ok && existing.value) return success();

    const invitations = await listInvitations({ status: "pending", query: emailNormalized, limit: 10 });
    if (invitations.ok && invitations.value.some((invitation) => normalizeEmail(invitation.email) === emailNormalized)) {
      return success();
    }

    const created = await createRequest(status.env, { name, email, emailNormalized, message });
    // A request for this address is already waiting.
    if (!created.created) return success();

    // Best effort: the request is saved, and shows in /admin either way.
    await sendAccountRequestEmail({
      name,
      email,
      message,
      reviewUrl: `${await siteOrigin()}/admin/requests/${created.id}`,
      isTest: status.env !== "production",
    });
    // And in the app, for whoever reviews requests. It names nobody, and never fails the request.
    await notifyBestEffort(status.env, accountRequestCreated(created));

    return success();
  } catch (error) {
    console.error("[account-request] Could not record the request:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: copy.errorBody }, { status: 500 });
  }
}

function success(): NextResponse<AccountRequestResponse> {
  return NextResponse.json({ ok: true }, { status: 200 });
}
