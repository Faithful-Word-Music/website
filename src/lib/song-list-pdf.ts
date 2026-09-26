import { interLines } from "@/lib/text-measure";
import type { Service, SongListMonth } from "@/types/song-list";

/**
 * Page geometry for the song list PDF (SongListPdf.tsx), in points - the unit
 * of a printed page (72 to the inch). Kept here, beside the maths that uses
 * it, so the layout and the fitting can never disagree.
 */
export const PDF_PAGE = {
  width: 612, // US Letter
  height: 792,
  paddingX: 36, // 0.5in
  paddingY: 25.2, // 0.35in
  columnGap: 32,
} as const;

/** The type sizes and fixed heights the fitting depends on. */
export const PDF_METRICS = {
  /** Heading, subtitle, their rule and the space under it. */
  headerPt: 53.5, // measured 52.6 in the rendered PDF
  /** The footnote, its rule and the space above it. */
  notePt: 25, // measured 24.2
  /** A service's date line, its rule, and the air above its first song. */
  serviceHeaderPt: 20.5,
  /** Hairline between song rows. */
  rowRulePt: 0.5,
  /** Song text size. */
  songSizePt: 9,
  /** Width of the number and key columns, and the title's right padding. */
  numberColumnPt: 28,
  keyColumnPt: 48,
  titlePaddingPt: 8,
  /** Row height limits: snug for a full month, never taller than looks good. */
  minRowPt: 11.5,
  maxRowPt: 17,
} as const;

/** Width of one of the two columns. */
export const COLUMN_WIDTH_PT =
  (PDF_PAGE.width - PDF_PAGE.paddingX * 2 - PDF_PAGE.columnGap) / 2;

/** Room the title has on one line: the column less the number and key columns. */
const TITLE_WIDTH_PT =
  COLUMN_WIDTH_PT - PDF_METRICS.numberColumnPt - PDF_METRICS.keyColumnPt - PDF_METRICS.titlePaddingPt;

/** How many lines a title takes, wrapping between words as the PDF does. */
export function titleLines(title: string): number {
  return interLines(title, PDF_METRICS.songSizePt, TITLE_WIDTH_PT);
}

/** Lines one service's songs take, pending slots included. */
function serviceLines(service: Service): number {
  const songLines = service.songs.reduce((total, song) => total + titleLines(song.title), 0);
  return songLines + service.pendingSongs;
}

/** Height of one service block, without the gap after it. */
export function serviceHeight(service: Service, rowPt: number): number {
  const rows = service.songs.length + service.pendingSongs;
  return (
    PDF_METRICS.serviceHeaderPt +
    serviceLines(service) * rowPt +
    Math.max(0, rows - 1) * PDF_METRICS.rowRulePt
  );
}

/** Height of a column of services stacked with `gapPt` between them. */
function columnHeight(services: Service[], rowPt: number, gapPt: number): number {
  if (services.length === 0) return 0;
  const blocks = services.reduce((total, service) => total + serviceHeight(service, rowPt), 0);
  return blocks + (services.length - 1) * gapPt;
}

/**
 * Split the month into two columns the way the sheet reads: services in date
 * order down the left column, then down the right. Services are never split,
 * so the choice is only where the left column ends - and the best place is
 * whichever leaves the taller column shortest.
 */
export function splitColumns(
  services: Service[],
  rowPt: number,
  gapPt: number,
): { left: Service[]; right: Service[]; tallest: number } {
  let best = { left: services, right: [] as Service[], tallest: Infinity };

  for (let split = 0; split <= services.length; split++) {
    const left = services.slice(0, split);
    const right = services.slice(split);
    const tallest = Math.max(columnHeight(left, rowPt, gapPt), columnHeight(right, rowPt, gapPt));
    // `<=` takes the later split on a tie, so the left column is the fuller
    // one, as in the sheet.
    if (tallest <= best.tallest) best = { left, right, tallest };
  }

  return best;
}

/** Height the two columns have once the heading (and any footnote) are placed. */
export function columnSpace(month: SongListMonth): number {
  return (
    PDF_PAGE.height -
    PDF_PAGE.paddingY * 2 -
    PDF_METRICS.headerPt -
    (month.note ? PDF_METRICS.notePt : 0)
  );
}

export interface PdfLayout {
  rowPt: number;
  gapPt: number;
  left: Service[];
  right: Service[];
}

/**
 * The row height, gap and column split that fill one page without spilling:
 * the tallest rows (up to maxRowPt) whose best split still fits. A light month
 * gets generous rows, a full one snug rows. If even the snuggest rows cannot
 * fit - an unusually long month - the smallest size is used and the PDF runs
 * on to a second page, whole services at a time.
 */
export function layoutMonth(month: SongListMonth): PdfLayout {
  const services = month.services;
  const available = columnSpace(month);
  // Clear air between services, so each reads as its own block: rows give
  // way to it, not the other way round.
  const gapPt = Math.ceil(services.length / 2) >= 7 ? 12 : 14;

  for (let rowPt = PDF_METRICS.maxRowPt; rowPt >= PDF_METRICS.minRowPt; rowPt -= 0.25) {
    const { left, right, tallest } = splitColumns(services, rowPt, gapPt);
    if (tallest <= available) return { rowPt, gapPt, left, right };
  }

  const rowPt = PDF_METRICS.minRowPt;
  const { left, right } = splitColumns(services, rowPt, gapPt);
  return { rowPt, gapPt, left, right };
}

/** The year the month's services fall in, for the subtitle ("... · 2026"). */
export function firstYear(month: SongListMonth): string | null {
  const dated = month.services.find((service) => service.date);
  return dated?.date?.slice(0, 4) ?? null;
}

/** "September" -> "september", "Missions Conference 2025" -> "missions-conference-2025". */
export function monthSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The PDF's address for a month tab. */
export function monthPdfPath(title: string): string {
  return `/song-list/pdf/${monthSlug(title)}`;
}

/** What the saved file is called: the sheet's own heading, e.g. "September Song List.pdf". */
export function pdfFileName(month: SongListMonth): string {
  const name = (month.heading ?? `${month.title} Song List`).replace(/[\\/:*?"<>|]+/g, "").trim();
  return `${name || "Song List"}.pdf`;
}
