import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getViewer } from "@/lib/auth/session";
import { fileLabel, findFile } from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { openDriveFile } from "@/lib/sheet-music-index";
import { getIndexSongForPage } from "@/lib/song-archive";

/**
 * GET /library/songs/<song>/sheet-music/<file>
 * e.g. /library/songs/the-solid-rock/sheet-music/standard-1.pdf
 *
 * Serves one sheet-music file from private Google Drive, after checking that
 * this visitor may have it. This check is the real protection: the song page
 * hides links to restricted files, but anyone could type this address, so
 * the route decides for itself with the same canAccessFile() the page uses.
 *
 *   unknown song or file   -> 404
 *   members only, signed out -> 401; signed in without access -> 403
 *                            (Drive is never asked in either case)
 *   allowed                -> the file, streamed from Drive untouched
 *
 * PDFs open in the browser; MuseScore files download as the original .mscz.
 * The Drive File ID never appears in the address or the response.
 */
const CONTENT_TYPES = {
  pdf: "application/pdf",
  musescore: "application/vnd.musescore.mscz",
} as const;

function jsonError(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status, headers: { "X-Robots-Tag": "noindex" } });
}

/** A filename safe for every browser: a plain one, and a UTF-8 one. */
function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
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

  // Public files need no session at all. Anything else needs a signed-in
  // member whose roles allow it - checked here, on the server, every time.
  const isPublic = canAccessFile(song, found.file, PUBLIC_VIEWER);
  if (!isPublic) {
    const viewer = await getViewer().catch(() => null);
    if (!viewer) return jsonError(401, "sign-in-required");
    if (!viewer.can("view_sheet_music") || !canAccessFile(song, found.file, MEMBER_VIEWER)) {
      return jsonError(403, "restricted");
    }
  }

  const body = await openDriveFile(found.file.driveFileId);
  if (!body) {
    return jsonError(502, "unavailable");
  }

  const { version, file } = found;
  const extension = file.format === "pdf" ? "pdf" : "mscz";
  const fileName = `${song.title} - ${fileLabel(version, file)}.${extension}`;
  const seconds = siteConfig.sheetMusic.revalidateSeconds;

  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[file.format],
      "Content-Disposition": contentDisposition(file.format === "pdf" ? "inline" : "attachment", fileName),
      // A public file may be kept by the CDN - but no longer than the Index
      // cache, so a song made private again stops being served within
      // minutes. A members-only file must never be cached anywhere shared,
      // or the next visitor could be handed it without signing in.
      "Cache-Control": isPublic
        ? `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
