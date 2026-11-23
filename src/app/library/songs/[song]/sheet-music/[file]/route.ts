import { NextResponse } from "next/server";

import { getViewer, isProfileBlocked, PROFILE_INCOMPLETE, sheetSubject } from "@/lib/auth/session";
import { decideSheetAccess } from "@/lib/auth/sheet-entitlement";
import { fileLabel, findFile } from "@/lib/sheet-music";
import { confirmDriveFile, currentFileResource, openDriveFile } from "@/lib/sheet-music-index";
import { getIndexSongForPage } from "@/lib/song-archive";

/**
 * GET /library/songs/<song>/sheet-music/<file>
 * e.g. /library/songs/the-solid-rock/sheet-music/standard-1.pdf
 *
 * Serves one sheet-music file from private Google Drive, after checking that
 * this visitor may have it. This check is the real protection: the song page
 * hides links to restricted files, but anyone could type this address, so
 * the route decides for itself, on rights no more than a minute old.
 *
 *   unknown song or file      -> 404
 *   rights cannot be read     -> 503
 *   restricted, signed out    -> 401; signed in without access -> 403
 *   withheld                  -> 403, except one file opened for staff review
 *                               (Drive is never asked for the file in these cases)
 *   allowed                   -> the file, streamed from Drive untouched
 *
 * No response is kept by a shared cache, so a file made private stops being
 * served as soon as the rights say so. A browser may keep a public file but
 * must ask here first (ETag); the answer comes only after the check.
 *
 * PDFs open in the browser; MuseScore files download as the original .mscz.
 * The Drive File ID never appears in the address or the response.
 */
const CONTENT_TYPES = {
  pdf: "application/pdf",
  musescore: "application/vnd.musescore.mscz",
} as const;

const PUBLIC_CACHE = "private, no-cache";
const RESTRICTED_CACHE = "private, no-store";

function jsonError(status: number, reason: string) {
  return NextResponse.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": RESTRICTED_CACHE, "X-Robots-Tag": "noindex" } },
  );
}

/** A filename safe for every browser: a plain one, and a UTF-8 one. */
function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/library/songs/[song]/sheet-music/[file]">,
) {
  const { song: slug, file: fileSlug } = await ctx.params;

  const lookup = await getIndexSongForPage(slug);
  if (!lookup.ok) {
    return jsonError(503, lookup.reason);
  }

  const song = lookup.song;
  const found = song ? findFile(song, fileSlug) : null;
  if (!song || !found) {
    return jsonError(404, "not-found");
  }

  const resource = await currentFileResource(song, found.file);
  if (!resource) return jsonError(503, "unavailable");

  // Public files need no session at all. Anything else is decided here, on
  // the server, every time.
  const isPublic = resource === "public";
  if (!isPublic) {
    let viewer;
    try {
      viewer = await getViewer();
    } catch {
      return jsonError(503, "unavailable");
    }
    if (!viewer) return jsonError(401, "sign-in-required");
    if (await isProfileBlocked(viewer)) return jsonError(403, PROFILE_INCOMPLETE.error);
    if (!decideSheetAccess(resource, await sheetSubject(viewer), "open").allowed) {
      return jsonError(403, "restricted");
    }
  }

  const confirmed = await confirmDriveFile(found.file);
  if (!confirmed) return jsonError(503, "unavailable");

  const etag = isPublic && confirmed.md5 ? `"${confirmed.md5}"` : null;
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": PUBLIC_CACHE } });
  }

  const body = await openDriveFile(found.file.driveFileId);
  if (!body) {
    return jsonError(502, "unavailable");
  }

  const { version, file } = found;
  const extension = file.format === "pdf" ? "pdf" : "mscz";
  const fileName = `${song.title} - ${fileLabel(version)}.${extension}`;

  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[file.format],
      "Content-Disposition": contentDisposition(file.format === "pdf" ? "inline" : "attachment", fileName),
      "Cache-Control": isPublic ? PUBLIC_CACHE : RESTRICTED_CACHE,
      ...(etag ? { ETag: etag } : {}),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
