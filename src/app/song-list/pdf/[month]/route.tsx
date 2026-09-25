import { renderToBuffer } from "@react-pdf/renderer";

import { SongListPdf } from "@/components/song-list/SongListPdf";
import { siteConfig } from "@/config/site";
import { getSongList } from "@/lib/google-sheets";
import { monthSlug, pdfFileName } from "@/lib/song-list-pdf";

/**
 * The open month as a PDF, e.g. /song-list/pdf/september.
 *
 * Built on request from the sheet, so it is always as current as the page:
 * the sheet itself is cached for siteConfig.songList.revalidateSeconds, and so
 * is the PDF at the CDN. `inline` opens it in the browser's PDF viewer, which
 * has its own print and download buttons; the filename is what "save" uses.
 */
export async function GET(_request: Request, ctx: RouteContext<"/song-list/pdf/[month]">) {
  const { month: slug } = await ctx.params;
  const result = await getSongList();

  if (!result.ok) {
    return new Response("The song list is unavailable right now.", { status: 503 });
  }

  const month = result.months.find((item) => monthSlug(item.title) === slug);
  // A month whose layout could not be read has no schedule to lay out.
  if (!month || month.fallbackRows || month.services.length === 0) {
    return new Response("No song list for that month.", { status: 404 });
  }

  const pdf = await renderToBuffer(<SongListPdf month={month} />);
  const fileName = pdfFileName(month);
  const seconds = siteConfig.songList.revalidateSeconds;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // The plain name for older browsers, the encoded one for everything else.
      "Content-Disposition": `inline; filename="${fileName.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 6}`,
    },
  });
}
