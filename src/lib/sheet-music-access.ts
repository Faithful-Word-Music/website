import type { IndexSong, SheetFile } from "@/lib/sheet-music";

/**
 * Which files to list and link for a visitor. The decision itself lives in
 * src/lib/auth/sheet-entitlement.ts; this applies it to the classification
 * the Index gave each file.
 *
 *   public    - anyone. Only files classified public.
 *   entitled  - someone whose access resolves to view_sheet_music
 *               (viewer.can, which is projected from their entitlement).
 *               Public and restricted files.
 *
 * Withheld files are never listed or bundled for anyone, and a file with no
 * classification counts as withheld. Staff review of a withheld file happens
 * only through the single-file route, which calls decideSheetAccess itself
 * and re-reads the rights first.
 */
export type Viewer = { kind: "public" } | { kind: "entitled" };

export const PUBLIC_VIEWER: Viewer = { kind: "public" };
export const ENTITLED_VIEWER: Viewer = { kind: "entitled" };

export function canAccessFile(_song: IndexSong, file: SheetFile, viewer: Viewer): boolean {
  const resource = file.eligibility ?? "withheld";
  switch (viewer.kind) {
    case "public":
      return resource === "public";
    case "entitled":
      return resource === "public" || resource === "restricted";
    default:
      return false;
  }
}
