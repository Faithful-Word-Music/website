import { timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { sendAlertEmail } from "@/lib/resend";
import { ARCHIVE_TAG, syncArchive } from "@/lib/song-archive";

/**
 * GET /api/cron/sync-archive
 *
 * Copies every service that has already happened from the spreadsheet into the
 * permanent archive. Vercel Cron calls this nightly (schedule in vercel.json),
 * sending `Authorization: Bearer $CRON_SECRET`. Anyone else gets a 401.
 *
 * Safe to run any number of times: services are keyed by date and AM/PM, so a
 * repeat run changes nothing that is already stored and frozen.
 *
 * If a run fails - or finds nothing at all to save, which means the sheet
 * could not be understood - an alert is emailed (siteConfig.songList.alertEmail),
 * so the history never silently stops being saved. Production only, so manual
 * test runs on a laptop do not send mail.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function alert(subject: string, lines: string[]) {
  if (process.env.VERCEL_ENV !== "production") return;
  const text = [
    ...lines,
    "",
    `Time: ${new Date().toISOString()}`,
    "The song list itself keeps working from the spreadsheet; only the permanent",
    "archive is not being updated. Check the function logs in Vercel for details,",
    "then run the sync again from Settings > Cron Jobs.",
  ].join("\n");
  await sendAlertEmail(subject, text);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const summary = await syncArchive(Date.now());

    revalidateTag(ARCHIVE_TAG, "max");
    revalidatePath("/song-list/archive");

    if (summary.sheetServices === 0) {
      await alert("Song archive sync found no services", [
        "The nightly archive sync ran, but found no past services in the spreadsheet.",
        "That usually means the sheet's layout changed or its tabs were renamed.",
      ]);
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    // The message is ours (sheet unreadable / DATABASE_URL missing) or the
    // driver's; it is logged and emailed, but the response stays generic.
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[song-archive] Sync failed:", message);
    await alert("Song archive sync failed", [
      "The nightly song archive sync failed.",
      `Reason: ${message}`,
    ]);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
