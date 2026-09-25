import { timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

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
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const summary = await syncArchive(Date.now());

    revalidateTag(ARCHIVE_TAG, "max");
    revalidatePath("/song-list/archive");

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    // The message is ours (sheet unreadable / DATABASE_URL missing) or the
    // driver's; it is logged, but the response stays generic.
    console.error(
      "[song-archive] Sync failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
