import { NextResponse } from "next/server";

import { searchContent } from "@/content/search";
import { ACTION_ERRORS, getViewer, type Viewer } from "@/lib/auth/session";
import { PARTICIPANT_PERMISSION } from "@/lib/availability/access";
import { changeServiceAvailability, loadMyAvailability } from "@/lib/availability/change";

/**
 * /api/account/availability - your OWN availability, for the site search's
 * "Update my availability…" (src/components/search/AvailabilityCommand.tsx).
 *
 *   GET   your coming services that can still be changed, and how you stand
 *         for each
 *   POST  { date, slot, status, note? }   mark yourself available, away, or
 *         back to your usual for one service
 *
 * A route, not a server action, because the palette is open over public pages
 * the session proxy never runs for; /api/account/* is in its matcher
 * (src/proxy.ts).
 *
 * Only for someone holding view_availability - checked here, on the server,
 * whatever the palette chose to show. And only ever the caller's own: the
 * body's fields are picked out one by one and no person is passed on, so
 * changeServiceAvailability() takes the target from the session. (Changing
 * someone else's needs manage_availability and stays on the Availability
 * page.) The write itself is that function: the same validation, the same
 * "has it started?" check and the same refresh as the page's own action.
 */

const headers = { "Cache-Control": "private, no-store" };
const refuse = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers });

async function participant(): Promise<{ viewer: Viewer } | { refused: NextResponse }> {
  let viewer: Viewer | null;
  try {
    viewer = await getViewer();
  } catch (error) {
    console.error("[availability] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return { refused: refuse(503, ACTION_ERRORS.unavailable) };
  }
  if (!viewer) return { refused: refuse(401, searchContent.availability.signedOut) };
  if (!viewer.can(PARTICIPANT_PERMISSION)) {
    console.warn(`[availability] Refused ${viewer.userId}: no ${PARTICIPANT_PERMISSION} permission.`);
    return { refused: refuse(403, ACTION_ERRORS.forbidden) };
  }
  return { viewer };
}

export async function GET() {
  const who = await participant();
  if ("refused" in who) return who.refused;
  try {
    return NextResponse.json({ ok: true, ...(await loadMyAvailability(who.viewer)) }, { headers });
  } catch (error) {
    console.error("[availability] Could not load someone's own services:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, searchContent.availability.loadError);
  }
}

export async function POST(request: Request) {
  const who = await participant();
  if ("refused" in who) return who.refused;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    // Named fields only: a `userId` in the body goes nowhere, so this can only ever change the caller's own.
    const result = await changeServiceAvailability(who.viewer, {
      date: body?.date,
      slot: body?.slot,
      status: body?.status,
      note: typeof body?.note === "string" ? body.note : undefined,
    });
    return result.ok ? NextResponse.json({ ok: true, message: result.message ?? "" }, { headers }) : refuse(422, result.error);
  } catch (error) {
    console.error("[availability] Could not save a change:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, ACTION_ERRORS.failed);
  }
}
