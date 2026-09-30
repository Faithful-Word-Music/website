import type { IndexSong, SheetFile } from "@/lib/sheet-music";

/**
 * Who may open which sheet-music file. THE ONE PLACE this is decided.
 *
 * Both the song page (whether to show a link) and the file route (whether to
 * serve the file) ask this function, so a hidden button is never the only
 * thing standing between a visitor and a restricted file.
 *
 *   public  - anyone. Only songs the Index marks as not copyrighted
 *             ("Copyrighted?" = "No"). "Yes", "Needs Review", a blank or
 *             anything unexpected keeps the file from the public.
 *   member  - someone signed in whose roles include the "View member sheet
 *             music" permission (by default every account: the Member role
 *             has it). Every file in the Index, copyrighted or not - this is
 *             sheet music for the ministry's own musicians.
 *
 * The file route builds the member viewer from the session
 * (src/lib/auth/session.ts); nothing here trusts the browser.
 */
export type Viewer = { kind: "public" } | { kind: "member" };

export const PUBLIC_VIEWER: Viewer = { kind: "public" };
export const MEMBER_VIEWER: Viewer = { kind: "member" };

export function canAccessFile(song: IndexSong, _file: SheetFile, viewer: Viewer): boolean {
  switch (viewer.kind) {
    case "public":
      return song.rights === "cleared";
    case "member":
      return true;
    default:
      return false;
  }
}
