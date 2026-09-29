import { NextResponse } from "next/server";

import { claimReport, releaseReport } from "@/lib/archive-store";
import { isCronAuthorized } from "@/lib/cron-auth";
import { buildQuarterlyReport } from "@/lib/quarterly-report";
import { renderQuarterlyReport } from "@/lib/quarterly-report-email";
import { sendAlertEmail, sendReportEmail } from "@/lib/resend";
import { getReportInputs } from "@/lib/song-archive";

/**
 * GET /api/cron/quarterly-report
 *
 * Emails the music director's quarterly song report to the ministry inbox
 * (siteConfig.mail.to, and nobody else). Vercel Cron calls this at 7 AM
 * Arizona time on January 1, April 1, July 1 and October 1 (schedule in
 * vercel.json); the report covers the quarter that has just ended.
 *
 * Needs `Authorization: Bearer $CRON_SECRET`, like the archive sync.
 *
 *   ?preview=1   returns the email as a web page instead of sending it
 *                (add &at=YYYY-MM-DD to see it as it would be sent that day)
 *   ?force=1     sends it now, from any environment, even if already sent
 *
 * Without either, it sends only in production and at most once per quarter
 * (recorded in the archive database), so a cron job that fires twice sends
 * one email. A failure is reported with an alert email.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const preview = params.get("preview") === "1";
  const force = params.get("force") === "1";
  // Only a real send reports its failures, so a test run on a laptop sends no mail.
  const live = force || process.env.VERCEL_ENV === "production";

  const inputs = await getReportInputs();
  if (!inputs) {
    console.error("[report] Neither the spreadsheet nor the archive could be read");
    if (!preview && live) {
      await sendAlertEmail(
        "Quarterly song report could not be built",
        "Neither the spreadsheet nor the archive database could be read, so this quarter's report was not sent.\nRun it again from Settings > Cron Jobs in Vercel once the problem is fixed.",
      );
    }
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // A preview can be taken as if sent on another day (?at=2026-10-01): services
  // posted for before then count as sung. Real sends always use the real time.
  const at = preview ? Date.parse(`${params.get("at")}T07:00:00-07:00`) : NaN;
  const report = Number.isNaN(at)
    ? buildQuarterlyReport(inputs.past, inputs.upcoming, inputs.loadedAt)
    : buildQuarterlyReport([...inputs.past, ...inputs.upcoming], inputs.upcoming, at);
  const email = renderQuarterlyReport(report, inputs.persistent);

  if (preview) {
    return new NextResponse(email.html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (!force) {
    if (!live) {
      return NextResponse.json({ ok: true, sent: false, reason: "not-production", quarter: report.id });
    }
    const claimed = await claimReport(report.id).catch((error: unknown) => {
      // Better one report too many than none: carry on without the guard.
      console.error("[report] Could not check the report log:", error instanceof Error ? error.message : error);
      return null;
    });
    if (claimed === false) {
      return NextResponse.json({ ok: true, sent: false, reason: "already-sent", quarter: report.id });
    }
  }

  const result = await sendReportEmail(email);
  if (!result.ok) {
    if (!force) await releaseReport(report.id).catch(() => undefined);
    await sendAlertEmail(
      "Quarterly song report failed to send",
      `The report for ${report.label} could not be sent (${result.reason}).\nCheck the function logs in Vercel, then run it again from Settings > Cron Jobs.`,
    );
    return NextResponse.json({ ok: false, quarter: report.id }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, quarter: report.id });
}
