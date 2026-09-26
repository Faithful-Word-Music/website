import type { NextRequest } from "next/server";

import { siteConfig } from "@/config/site";
import { buildCalendar, parseKinds } from "@/lib/calendar";
import { getSongList } from "@/lib/google-sheets";

/**
 * The song list as a calendar to subscribe to, e.g.
 * /song-list/calendar.ics?services=sun-am,sun-pm (see src/lib/calendar.ts).
 *
 * Calendar apps fetch this every hour or so. If the sheet cannot be read the
 * answer is an error, never an empty calendar - an empty one would wipe every
 * subscriber's events until the next successful fetch.
 */
export async function GET(request: NextRequest) {
  const result = await getSongList();
  if (!result.ok) {
    return new Response("The song list is unavailable right now.", {
      status: 503,
      headers: { "Retry-After": "600" },
    });
  }

  const kinds = parseKinds(request.nextUrl.searchParams.get("services"));
  const body = buildCalendar(result.months, kinds, Date.now());
  const seconds = siteConfig.songList.revalidateSeconds;

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="faithful-word-music.ics"',
      "Cache-Control": `public, max-age=0, s-maxage=${seconds * 30}, stale-while-revalidate=${seconds * 180}`,
    },
  });
}
