import { renderToBuffer } from "@react-pdf/renderer";

import { SongListPdf } from "@/components/song-list/SongListPdf";
import { getViewer } from "@/lib/auth/session";
import { ROSTER_PERMISSION, SCHEDULER_PERMISSION } from "@/lib/leadership/access";
import { matchCardLeaders, songListLeaders, type CardLeaderView } from "@/lib/leadership/board";
import { loadBoard } from "@/lib/leadership/load";
import { getSchedule } from "@/lib/schedule";
import { monthSlug, pdfFileName } from "@/lib/song-list-pdf";
import { serviceSlots } from "@/lib/song-list";

/**
 * The open month as a PDF, with who leads the songs - the signed-in twin of
 * the public /song-list/pdf/[month]. Only for someone who prepares from the
 * song lists (view_service_plans) or plans them; leaders show for published
 * services only, decided now, on every request.
 *
 * Its own address, never the public one's, and never cached anywhere: the
 * public PDF is cached at the CDN for everyone, and must never hold names.
 * Names, never "you": a printout is passed around.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/account/song-list-pdf/[month]">) {
  const headers = { "Cache-Control": "private, no-store" };
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to download this song list.", { status: 401, headers });
  if (!viewer.can(ROSTER_PERMISSION) && !viewer.can(SCHEDULER_PERMISSION)) {
    return new Response("You do not have access to this song list.", { status: 403, headers });
  }

  const { month: slug } = await ctx.params;
  const result = await getSchedule();
  if (!result.ok) return new Response("The song list is unavailable right now.", { status: 503, headers });
  const found = result.months.find((item) => monthSlug(item.title) === slug);
  const month = found && { ...found, services: found.services.filter((service) => !service.placeholder) };
  if (!month || month.fallbackRows || month.services.length === 0) {
    return new Response("No song list for that month.", { status: 404, headers });
  }

  const now = Date.now();
  const board = await loadBoard(viewer.env, now, { exceptions: false });
  // As anyone with the same access sees it, but never as "you".
  const printed = songListLeaders(board, { userId: "", can: (permission) => viewer.can(permission) }, now);
  const byAnchor = new Map(printed.map((service) => [service.anchor, service]));
  const leaders: Record<string, CardLeaderView> = {};
  for (const service of month.services) {
    const answer = byAnchor.get(service.id);
    const view = answer ? matchCardLeaders(answer, serviceSlots(service)) : null;
    if (view) leaders[service.id] = view;
  }

  const pdf = await renderToBuffer(<SongListPdf months={[month]} leaders={leaders} />);
  const fileName = pdfFileName(month);
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
