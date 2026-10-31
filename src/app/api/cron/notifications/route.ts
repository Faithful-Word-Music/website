import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { drainChanges } from "@/lib/leadership/notify";
import { drainEmail } from "@/lib/notifications/email-store";
import { plannerConfigured } from "@/lib/service-planner/store";
import { scheduleEnv } from "@/lib/schedule";
import { drainSupportEvents } from "@/lib/support/notify";

/**
 * GET /api/cron/notifications
 *
 * The daily safety net for what is normally done straight after each change
 * (src/lib/leadership/notify.ts, src/lib/notifications/email-store.ts):
 *
 *   1. song leader changes saved but never told - the server stopped before
 *      it could, or a notification could not be recorded - are told now;
 *   2. support request events never told (src/lib/support/notify.ts) are
 *      told now, the same way;
 *   3. emails still owed are sent: retries that came due, and rows whose
 *      worker never finished.
 *
 * All are safe to repeat: a change told twice tells nobody twice (dedupe
 * keys), and an email sent twice is delivered once (idempotency keys).
 * Vercel Cron calls it once a day (vercel.json) with `Authorization: Bearer
 * $CRON_SECRET`, right after the archive sync, so the database is woken once
 * for both. Anyone else gets a 401. It works on this deployment's own Clerk
 * environment only.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!plannerConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });

  const env = scheduleEnv();
  const changes = await drainChanges(env, 0);
  const support = await drainSupportEvents(env, 0);
  // A few rounds, so a backlog clears; each round takes at most 50 rows.
  let sent = 0;
  let retrying = 0;
  let failed = 0;
  let skipped = 0;
  let held = false;
  for (let round = 0; round < 5; round += 1) {
    const result = await drainEmail(env, 50);
    if (!result) break;
    sent += result.sent;
    retrying += result.retrying;
    failed += result.failed;
    skipped += result.skipped;
    held = result.held;
    if (result.held || result.sent + result.retrying + result.failed + result.skipped === 0) break;
  }
  return NextResponse.json({ ok: true, changes, support, email: { sent, retrying, failed, skipped, held } });
}
