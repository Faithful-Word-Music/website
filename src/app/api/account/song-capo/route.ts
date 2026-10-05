import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { getCapoRules, listSheetMusicTypes, setSongCapoRule } from "@/lib/auth/store";
import { capoRequired, capoRequiredByKey, isSongCapoRule, songCapoRule, type SongCapoRule } from "@/lib/capo-policy";
import { listCatalogSongs } from "@/lib/service-planner/store";
import { matchIndexSong } from "@/lib/sheet-music";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { canonicalKey } from "@/lib/song-key";
import { songKey } from "@/lib/song-list";

/**
 * /api/account/song-capo - one song's capo sheet music setting, for the
 * control on its page (src/components/song-list/SongCapoSetting.tsx). Song
 * pages are static and public, so the page asks here once it knows the person
 * looks after sheet music; only they are answered (manage_sheet_music).
 *
 *   GET  ?title=<title>&number=<number>
 *   POST { title, number, rule: "global" | "always" | "never" }
 *
 * Both answer with the song as the capo rule sees it:
 *   { rule, key, required, policyRequires, type }
 * `key` is the song's own key (src/lib/song-key.ts), `required` the outcome,
 * `policyRequires` what the site's policy alone says, and `type` the capo
 * sheet music type's name (null when none is set).
 */

const headers = { "Cache-Control": "private, no-store" };

export interface SongCapoState {
  rule: SongCapoRule;
  key: string | null;
  required: boolean;
  policyRequires: boolean;
  type: string | null;
}

function refuse(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status, headers });
}

async function authorized(): Promise<Viewer | NextResponse> {
  const viewer = await getViewer().catch(() => null);
  if (!viewer) return refuse(401, "sign-in-required");
  if (!viewer.can("manage_sheet_music")) return refuse(403, "forbidden");
  return viewer;
}

/** The song from the request, or null when it names none. */
function songFrom(title: unknown, number: unknown): { title: string; number: string | null } | null {
  if (typeof title !== "string" || title.length > 200 || songKey(title) === "") return null;
  return { title, number: typeof number === "string" && number.trim() !== "" ? number.trim().slice(0, 12) : null };
}

async function stateFor(viewer: Viewer, song: { title: string; number: string | null }): Promise<SongCapoState> {
  const [rules, types, index, catalog] = await Promise.all([
    getCapoRules(viewer.env),
    listSheetMusicTypes(viewer.env),
    getSheetMusicIndex(),
    listCatalogSongs(viewer.env).catch(() => []),
  ]);
  const indexSong = index.ok ? matchIndexSong(index.index, song, siteConfig.sheetMusic.hymnalCollection) : null;
  const key = canonicalKey({
    indexKeys: indexSong?.keys,
    catalogKey: catalog.find((entry) => songKey(entry.title) === songKey(song.title))?.defaultKey,
  });
  const rule = songCapoRule(song.title, rules);
  return {
    rule,
    key,
    required: capoRequired(key, rules.policy, rule),
    policyRequires: capoRequiredByKey(key, rules.policy),
    type: types.find((type) => type.id === rules.policy.typeId)?.label ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const viewer = await authorized();
    if (viewer instanceof NextResponse) return viewer;
    const params = new URL(request.url).searchParams;
    const song = songFrom(params.get("title"), params.get("number"));
    if (!song) return refuse(400, "invalid");
    return NextResponse.json({ ok: true, ...(await stateFor(viewer, song)) }, { headers });
  } catch (error) {
    console.error("[sheet-music] /api/account/song-capo failed:", error instanceof Error ? error.message : "unknown error");
    return refuse(500, "unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await authorized();
    if (viewer instanceof NextResponse) return viewer;
    const body = (await request.json().catch(() => null)) as { title?: unknown; number?: unknown; rule?: unknown } | null;
    const song = songFrom(body?.title, body?.number);
    if (!song || !isSongCapoRule(body?.rule)) return refuse(400, "invalid");
    await setSongCapoRule(viewer.env, songKey(song.title), body.rule, viewer.userId);
    revalidatePath("/dashboard");
    revalidatePath("/service-planner", "layout");
    return NextResponse.json({ ok: true, ...(await stateFor(viewer, song)) }, { headers });
  } catch (error) {
    console.error("[sheet-music] /api/account/song-capo failed:", error instanceof Error ? error.message : "unknown error");
    return refuse(500, "unavailable");
  }
}
