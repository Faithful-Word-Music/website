import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { fileLabel, findFile } from "@/lib/sheet-music";
import { canAccessFile, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { openDriveFile } from "@/lib/sheet-music-index";
import { getIndexSongForPage } from "@/lib/song-archive";

/**
 * GET /song-list/archive/<song>/sheet-music/<file>
 * e.g. /song-list/archive/the-solid-rock/sheet-music/standard-1.pdf
 *
 * Serves one sheet-music file from private Google Drive, after checking that
 * this visitor may have it. This check is the real protection: the song page
 * hides links to restricted files, but anyone could type this address, so
 * the route decides for itself with the same canAccessFile() the page uses.
 *
 *   unknown song or file   -> 404
 *   not allowed            -> 403, and Drive is never asked
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
  ctx: RouteContext<"/song-list/archive/[song]/sheet-music/[file]">,
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

  if (!canAccessFile(song, found.file, PUBLIC_VIEWER)) {
    return jsonError(403, "restricted");
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
      // Public files only reach this point, so the CDN may keep a copy - but
      // no longer than the Index cache, so a song made private again stops
      // being served within minutes. Revisit when signed-in access arrives:
      // restricted files must then be sent with "private, no-store".
      "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
