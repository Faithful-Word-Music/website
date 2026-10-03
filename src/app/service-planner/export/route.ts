import { getViewer } from "@/lib/auth/session";
import { addDays, churchDate, isDateString } from "@/lib/availability/occurrences";
import { exportFileName, exportMonths, exportRows, toCsv } from "@/lib/service-planner/export";
import { formattedWorkbook, rawWorkbook } from "@/lib/service-planner/export-files";
import { formattedPdf } from "@/lib/service-planner/export-pdf";
import { loadExport } from "@/lib/service-planner/load";
import { parseAnchor } from "@/lib/service-planner/model";

/**
 * GET /service-planner/export - the planner's services as a file.
 *
 *   ?format=raw-xlsx | raw-csv | formatted-xlsx | formatted-pdf
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD     a range (this month by default)
 *   &services=2026-10-11-am,...        or chosen services (their range is implied)
 *   &drafts=1                          include unpublished drafts
 *
 * One-way: exports are copies for people and other programs. Nothing is
 * ever read back from them. Only for manage_service_plans - drafts and the
 * planner's working data are the Music Director's.
 */
export const dynamic = "force-dynamic";

const FORMATS = ["raw-xlsx", "raw-csv", "formatted-xlsx", "formatted-pdf"] as const;
type Format = (typeof FORMATS)[number];

const MAX_DAYS = 3 * 366;

function attachment(body: Uint8Array | string, type: string, fileName: string): Response {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  const viewer = await getViewer().catch(() => null);
  if (!viewer) return new Response("Please log in.", { status: 401 });
  if (!viewer.can("manage_service_plans")) return new Response("Not allowed.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const format = params.get("format") as Format | null;
  if (!format || !FORMATS.includes(format)) return new Response("Unknown format.", { status: 400 });

  const anchors = params.get("services")?.split(",").filter(Boolean) ?? null;
  const parsed = anchors?.map(parseAnchor) ?? null;
  if (parsed && (parsed.length === 0 || parsed.length > 200 || parsed.some((item) => item === null))) {
    return new Response("Unknown services.", { status: 400 });
  }

  const today = churchDate(Date.now());
  const dates = parsed?.map((item) => item!.date).sort() ?? null;
  const from = dates ? dates[0] : (params.get("from") ?? `${today.slice(0, 7)}-01`);
  const to = dates ? dates[dates.length - 1] : (params.get("to") ?? addDays(`${today.slice(0, 7)}-01`, 31));
  if (!isDateString(from) || !isDateString(to) || from > to || addDays(from, MAX_DAYS) < to) {
    return new Response("Please choose a range of up to three years.", { status: 400 });
  }

  const services = await loadExport(viewer, { from, to, anchors, drafts: params.get("drafts") === "1" });

  switch (format) {
    case "raw-csv":
      // A byte-order mark, so Excel reads the file as UTF-8.
      return attachment(`﻿${toCsv(exportRows(services))}`, "text/csv; charset=utf-8", exportFileName("raw", from, to, "csv"));
    case "raw-xlsx":
      return attachment(
        await rawWorkbook(exportRows(services)),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        exportFileName("raw", from, to, "xlsx"),
      );
    case "formatted-xlsx":
      return attachment(
        await formattedWorkbook(exportMonths(services, Number(today.slice(0, 4)))),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        exportFileName("formatted", from, to, "xlsx"),
      );
    case "formatted-pdf": {
      const months = exportMonths(services, Number(today.slice(0, 4)));
      if (months.length === 0) return new Response("No services in that range.", { status: 404 });
      const pdf = await formattedPdf(months);
      return attachment(pdf, "application/pdf", exportFileName("formatted", from, to, "pdf"));
    }
  }
}
