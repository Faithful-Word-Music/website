import type { IndexSong, SheetFile } from "@/lib/sheet-music";

/**
 * Who may open which sheet-music file. THE ONE PLACE this is decided.
 *
 * Both the song page (whether to show a link) and the file route (whether to
 * serve the file) ask this function, so a hidden button is never the only
 * thing standing between a visitor and a restricted file.
 *
 * Today every visitor is public, and a file is public only when the Index
 * says the song is not copyrighted ("Copyrighted?" = "No"). "Yes", "Needs
 * Review", a blank or anything unexpected keeps the file private.
 *
 * When accounts arrive, add a signed-in kind here - for example
 *     | { kind: "member"; userId: string; roles: string[] }
 * - build it from the session in the file route and the song page, and
 * widen the rule below. Nothing about the Index or Drive has to change.
 */
export type Viewer = { kind: "public" };

export const PUBLIC_VIEWER: Viewer = { kind: "public" };

export function canAccessFile(song: IndexSong, _file: SheetFile, viewer: Viewer): boolean {
  switch (viewer.kind) {
    case "public":
      return song.rights === "cleared";
    default:
      return false;
  }
}
