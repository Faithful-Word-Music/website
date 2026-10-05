import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { getSheetMusicTypes } from "@/lib/auth/store";
import { serviceSheets } from "@/lib/dashboard/coming-up";
import { getSchedule } from "@/lib/schedule";
import { MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { getSheetMusicIndex, openDriveFile } from "@/lib/sheet-music-index";
import { buildServicePacket, type PacketSong } from "@/lib/service-sheet-pdf";
import { serviceAnchor } from "@/lib/site-search";

/**
 * GET /dashboard/sheet-music/<service>, e.g. /dashboard/sheet-music/2026-10-04-am
 *
 * Everything the signed-in person plays from for one service, as one PDF to
 * print in one go (see src/lib/service-sheet-pdf.ts). Their files only: for
 * each song, the first of their assigned sheet music types it has, among the
 * files their permissions open - the same serviceSheets() rule as the
 * Dashboard's links, with access decided here on the server, never trusted
 * from the page.
 *
 * With ?type=<id>, the service in that one sheet music type instead, whoever
 * it is assigned to - for the people who look after the sheet music and print
 * for others (manage_sheet_music). Without it, nothing here changes.
 *
 *   signed out                 -> 401 (the proxy sends them to sign in first)
 *   ?type without the permission -> 403; an unknown type -> 404
 *   no types assigned          -> 404
 *   unknown service, or none of
 *   its songs has their music  -> 404
 *   song list or Index down    -> 503
 *   none of the files would load -> 502
 *
 * Songs without their music, or whose file will not load, are left out.
 * Never cached anywhere shared: it holds members-only files.
 */

function jsonError(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status, headers: { "X-Robots-Tag": "noindex" } });
}

async function readDriveFile(driveFileId: string): Promise<Uint8Array | null> {
  const body = await openDriveFile(driveFileId);
  if (!body) return null;
  try {
    return new Uint8Array(await new Response(body).arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: RouteContext<"/dashboard/sheet-music/[service]">) {
  const { service: anchor } = await ctx.params;

  const viewer = await getViewer().catch(() => null);
  if (!viewer) return jsonError(401, "sign-in-required");

  // One chosen type, for someone who prints for others - or the person's own.
  const chosen = new URL(request.url).searchParams.get("type");
  if (chosen !== null && !viewer.can("manage_sheet_music")) return jsonError(403, "forbidden");
  const sheetTypes = chosen !== null ? [Number(chosen)] : await getSheetMusicTypes(viewer.env, viewer.userId);
  if (sheetTypes.length === 0) return jsonError(404, "no-sheet-music-type");

  const [songList, sheetMusic] = await Promise.all([getSchedule(), getSheetMusicIndex()]);
  if (!songList.ok || !sheetMusic.ok) return jsonError(503, "unavailable");
  const chosenType = chosen !== null ? sheetMusic.index.types.find((type) => type.id === sheetTypes[0]) : null;
  if (chosen !== null && !chosenType) return jsonError(404, "no-sheet-music-type");

  const service = songList.months
    .flatMap((month) => month.services)
    .find((candidate) => !candidate.placeholder && candidate.date && serviceAnchor(candidate.date, candidate.slot) === anchor);
  if (!service) return jsonError(404, "not-found");

  const sheets = serviceSheets(service, {
    index: sheetMusic.index,
    sheetTypes,
    viewer: viewer.can("view_sheet_music") ? MEMBER_VIEWER : PUBLIC_VIEWER,
  });
  if (!sheets.some((sheet) => sheet.found)) return jsonError(404, "no-sheet-music");

  const songs: PacketSong[] = (
    await Promise.all(
      sheets.map(async (sheet) => {
        const pdf = sheet.found ? await readDriveFile(sheet.found.file.driveFileId) : null;
        return pdf ? { number: sheet.number, title: sheet.title, pdf } : null;
      }),
    )
  ).filter((song) => song !== null);

  const label = [service.dateLabel, service.serviceLabel].filter(Boolean).join(" · ");
  const kind = chosenType ? `Sheet Music (${chosenType.label})` : "Sheet Music";
  const pdf = songs.length > 0 ? await buildServicePacket(`${kind} · ${label}`, songs) : null;
  if (!pdf) return jsonError(502, "unavailable");

  const fileName = `${service.date}${service.serviceLabel ? ` ${service.serviceLabel}` : ""} - ${kind}.pdf`;
  const plain = fileName.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
