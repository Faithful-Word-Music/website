/**
 * Exports: the planner's services as rows and months, for spreadsheets and
 * PDFs. Pure - unit tested; the files themselves are written in
 * export-files.ts.
 *
 * Exports are OUTPUTS. Nothing reads a spreadsheet back in: the planner is
 * the one source of the song list, and an exported file is only a copy.
 */

import { songListContent } from "@/content/song-list";
import { monthTitle } from "@/lib/schedule-months";
import { dateLabelFor, dayOfWeek } from "@/lib/service-time";
import { serviceAnchor } from "@/lib/site-search";
import type { SongListMonth } from "@/types/song-list";

import { churchTimeOf, serviceTitle } from "./format";
import { emptyPositions, isInsert, slotSongs, type PlanSlots } from "./model";

/** One service to export, from the planner or (before it existed) the archive. */
export interface ExportService {
  date: string;
  slot: "AM" | "PM";
  startsAt: string;
  label: string | null;
  special: boolean;
  /** "archived": a past service from before the planner, known only from the archive. */
  status: "published" | "draft" | "archived";
  slots: PlanSlots;
}

/** The raw export's columns, in order. */
export const RAW_COLUMNS = [
  { key: "date", header: "Date", width: 12 },
  { key: "weekday", header: "Weekday", width: 11 },
  { key: "service", header: "Service", width: 22 },
  { key: "slot", header: "AM/PM", width: 7 },
  { key: "startTime", header: "Start time", width: 10 },
  { key: "position", header: "Position", width: 9 },
  { key: "number", header: "Hymn number", width: 12 },
  { key: "title", header: "Song", width: 42 },
  { key: "key", header: "Key", width: 8 },
  { key: "insert", header: "Insert", width: 8 },
  { key: "special", header: "Special service", width: 15 },
  { key: "status", header: "Status", width: 11 },
] as const;

export type RawRow = Record<(typeof RAW_COLUMNS)[number]["key"], string | number>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One row per song, in service then song order - plain data for analysis or another system. */
export function exportRows(services: readonly ExportService[]): RawRow[] {
  return [...services]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .flatMap((service) =>
      service.slots.flatMap((song, index) =>
        song
          ? [
              {
                date: service.date,
                weekday: WEEKDAYS[dayOfWeek(service.date)],
                service: serviceTitle(service),
                slot: service.slot,
                startTime: churchTimeOf(service.startsAt),
                position: index + 1,
                number: song.number ?? "",
                title: song.title,
                key: song.key ?? "",
                insert: isInsert(song) ? "Yes" : "No",
                special: service.special ? "Yes" : "No",
                status: service.status,
              },
            ]
          : [],
      ),
    );
}

/** A CSV cell: quoted when it must be, with quotes doubled. Formulas are defused. */
function csvCell(value: string | number): string {
  let text = String(value);
  // A cell starting =, +, - or @ would run as a formula in a spreadsheet.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The raw rows as CSV, with a header row. */
export function toCsv(rows: readonly RawRow[]): string {
  const header = RAW_COLUMNS.map((column) => csvCell(column.header)).join(",");
  const body = rows.map((row) => RAW_COLUMNS.map((column) => csvCell(row[column.key])).join(","));
  return [header, ...body].join("\r\n") + "\r\n";
}

/**
 * The services as song-list months - the same shape the song list and its
 * PDF use, so the formatted exports look like them. Empty places show as
 * "to be announced" in their own positions.
 */
export function exportMonths(
  services: readonly ExportService[],
  currentYear: number,
): SongListMonth[] {
  const byMonth = new Map<string, ExportService[]>();
  for (const service of [...services].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const month = service.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), service]);
  }

  return [...byMonth.entries()].map(([month, items]) => ({
    title: monthTitle(month, currentYear),
    heading: `${monthTitle(month, Number(month.slice(0, 4)))} Song List`,
    fallbackRows: null,
    services: items.map((service) => {
      const empty = emptyPositions(service.slots);
      return {
        id: serviceAnchor(service.date, service.slot),
        dateLabel: dateLabelFor(service.date),
        serviceLabel: service.label ?? songListContent.serviceMarkerLabels[service.slot],
        slot: service.slot,
        date: service.date,
        startsAt: service.startsAt,
        songs: slotSongs(service.slots),
        pendingSongs: empty.length,
        pendingPositions: empty,
      };
    }),
  }));
}

/** A file name for an export: "Song List 2026-10-01 to 2026-10-31.xlsx". */
export function exportFileName(kind: "raw" | "formatted", from: string, to: string, extension: string): string {
  const name = kind === "raw" ? "Song List data" : "Song List";
  const range = from === to ? from : `${from} to ${to}`;
  return `${name} ${range}.${extension}`;
}
