import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { getSheetMusicTypes } from "@/lib/auth/store";
import { servicePackets, servicePacketTypes } from "@/lib/dashboard/coming-up";
import { getSchedule } from "@/lib/schedule";
import { MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";

/**
 * GET /api/account/sheet-music
 *
 * The signed-in person's sheet music for each published service on the song
 * list, as the Dashboard offers it: one PDF per service built from their own
 * assigned types (src/lib/dashboard/coming-up.ts). The song list is static and
 * the same for everyone, so it asks here once the page has loaded.
 *
 *   { assigned: false }                              no sheet music types assigned
 *   { assigned: true, packets: { "2026-10-04-am": {...} | null, ... } }
 *
 * Someone who looks after the sheet music (manage_sheet_music) also gets
 * `types`: for each service, every sheet music type it can be printed in.
 *
 * Describes only the person asking. The PDF route checks everything again.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    // The schedule and the Index do not depend on who is asking: read them alongside the session.
    const reads = Promise.all([getSchedule(), getSheetMusicIndex()]);
    reads.catch(() => null);

    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ signedIn: false }, { status: 401, headers });

    const sheetTypes = await getSheetMusicTypes(viewer.env, viewer.userId);
    const printsForOthers = viewer.can("manage_sheet_music");
    if (sheetTypes.length === 0 && !printsForOthers) return NextResponse.json({ assigned: false }, { headers });

    const [schedule, index] = await reads;
    if (!schedule.ok || !index.ok) return NextResponse.json({ assigned: true, unavailable: true }, { status: 503, headers });

    const services = schedule.months.flatMap((month) => month.services);
    const sheetViewer = viewer.can("view_sheet_music") ? MEMBER_VIEWER : PUBLIC_VIEWER;
    const types = printsForOthers ? servicePacketTypes(services, { index: index.index, viewer: sheetViewer }) : undefined;
    if (sheetTypes.length === 0) return NextResponse.json({ assigned: false, types }, { headers });

    const packets = servicePackets(services, { index: index.index, sheetTypes, viewer: sheetViewer });
    return NextResponse.json({ assigned: true, packets, types }, { headers });
  } catch (error) {
    console.error("[sheet-music] /api/account/sheet-music failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ assigned: true, unavailable: true }, { status: 500, headers });
  }
}
