import { songListContent } from "@/content/song-list";
import { splitDateLabel } from "@/lib/service-time";
import { monthSlug, serviceSlots } from "@/lib/song-list";
import { interLines, interWidth } from "@/lib/text-measure";
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
  /** The site and contact line at the foot of every page, and the space above it. */
  footerPt: 14,
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

/**
 * Who leads each song, as the signed-in PDF prints it (in a column before the key): by
 * service id, a name (or null) for each row, empty places included.
 */
export type PrintedLeaders = ReadonlyMap<string, ReadonlyArray<string | null>>;

/** The leaders' type: small and grey, right-aligned in a column before the key. */
export const LEADER_SIZE_PT = 7.5;
/** The key column beside the leaders: wide enough for "C#m", not the full 48pt the key alone takes. */
const KEY_BESIDE_LEADERS_PT = 24;

/**
 * The leaders' column for one service (the signed-in PDF, several people
 * leading it): exactly as wide as its longest name, so the names line up on
 * their right edge, against the key - and the titles give up as little room
 * as possible. It takes the key column's unused space first. Null when no
 * song names a leader.
 */
export function leaderColumn(names: ReadonlyArray<string | null>): { leaderPt: number; keyPt: number; titlePt: number } | null {
  const widths = names.flatMap((name) => (name ? [interWidth(name, LEADER_SIZE_PT)] : []));
  if (widths.length === 0) return null;
  const leaderPt = Math.ceil(Math.max(...widths)) + 2;
  const keyPt = KEY_BESIDE_LEADERS_PT;
  return {
    leaderPt,
    keyPt,
    titlePt: COLUMN_WIDTH_PT - PDF_METRICS.numberColumnPt - keyPt - PDF_METRICS.titlePaddingPt - leaderPt,
  };
}

/** How many lines a title takes, wrapping between words as the PDF does, in `width` points. */
export function titleLines(title: string, width: number = TITLE_WIDTH_PT): number {
  return interLines(title, PDF_METRICS.songSizePt, width);
}

/** Lines one service's songs take, pending slots included - with its leaders' column, when it has one. */
function serviceLines(service: Service, leaders: ReadonlyArray<string | null> = []): number {
  const width = leaderColumn(leaders)?.titlePt ?? TITLE_WIDTH_PT;
  return serviceSlots(service).reduce((total, song) => total + (song ? titleLines(song.title, width) : 1), 0);
}

/** Height of one service block, without the gap after it. */
export function serviceHeight(service: Service, rowPt: number, leaders: ReadonlyArray<string | null> = []): number {
  const rows = service.songs.length + service.pendingSongs;
  return (
    PDF_METRICS.serviceHeaderPt +
    serviceLines(service, leaders) * rowPt +
    Math.max(0, rows - 1) * PDF_METRICS.rowRulePt
  );
}

/** Height of a column of services stacked with `gapPt` between them. */
function columnHeight(services: Service[], rowPt: number, gapPt: number, leaders: PrintedLeaders): number {
  if (services.length === 0) return 0;
  const blocks = services.reduce((total, service) => total + serviceHeight(service, rowPt, leaders.get(service.id)), 0);
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
  /** Who leads each song, printed after its title (the signed-in PDF only). */
  leaders: PrintedLeaders = new Map(),
): { left: Service[]; right: Service[]; tallest: number } {
  let best = { left: services, right: [] as Service[], tallest: Infinity };

  for (let split = 0; split <= services.length; split++) {
    const left = services.slice(0, split);
    const right = services.slice(split);
    const tallest = Math.max(columnHeight(left, rowPt, gapPt, leaders), columnHeight(right, rowPt, gapPt, leaders));
    // `<=` takes the later split on a tie, so the left column is the fuller
    // one, as in the sheet.
    if (tallest <= best.tallest) best = { left, right, tallest };
  }

  return best;
}

/** Height the two columns have once the heading and footer are placed. */
export function columnSpace(): number {
  return (
    PDF_PAGE.height -
    PDF_PAGE.paddingY * 2 -
    PDF_METRICS.headerPt -
    PDF_METRICS.footerPt
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
export function layoutMonth(month: SongListMonth, leaders: PrintedLeaders = new Map()): PdfLayout {
  const services = month.services;
  const available = columnSpace();
  // Clear air between services, so each reads as its own block: rows give
  // way to it, not the other way round.
  const gapPt = Math.ceil(services.length / 2) >= 7 ? 12 : 14;

  for (let rowPt = PDF_METRICS.maxRowPt; rowPt >= PDF_METRICS.minRowPt; rowPt -= 0.25) {
    const { left, right, tallest } = splitColumns(services, rowPt, gapPt, leaders);
    if (tallest <= available) return { rowPt, gapPt, left, right };
  }

  const rowPt = PDF_METRICS.minRowPt;
  const { left, right } = splitColumns(services, rowPt, gapPt, leaders);
  return { rowPt, gapPt, left, right };
}

/** The year the month's services fall in, for the subtitle ("... · 2026"). */
export function firstYear(month: SongListMonth): string | null {
  const dated = month.services.find((service) => service.date);
  return dated?.date?.slice(0, 4) ?? null;
}

// Lives in song-list.ts, where service ids are built from it.
export { monthSlug };

/** The PDF's address for a month tab. */
export function monthPdfPath(title: string): string {
  return `/song-list/pdf/${monthSlug(title)}`;
}

/** What the saved file is called: the sheet's own heading, e.g. "September Song List.pdf". */
export function pdfFileName(month: SongListMonth): string {
  const name = (month.heading ?? `${month.title} Song List`).replace(/[\\/:*?"<>|]+/g, "").trim();
  return `${name || "Song List"}.pdf`;
}

/**
 * A service's heading in print: "Sunday, October 4" - or, for a special
 * service, its own name in the weekday's place ("Missions Conference,
 * October 16"). Shared by the PDF and the formatted spreadsheet export.
 */
export function printedServiceDate(service: Pick<Service, "dateLabel" | "serviceLabel">): string {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const usual = Object.values(songListContent.serviceMarkerLabels) as string[];
  const special = service.serviceLabel !== null && !usual.includes(service.serviceLabel);
  return weekday && day ? `${special ? service.serviceLabel : weekday}, ${day}` : service.dateLabel;
}

/**
 * The signed-in PDF for a month tab, with who leads the songs - its own
 * address, never cached, never the public one's (/api/account/song-list-pdf).
 */
export function memberPdfPath(title: string): string {
  return `/api/account/song-list-pdf/${monthSlug(title)}`;
}

/**
 * A leader's name as the PDF prints it, short so it never pushes a title onto
 * a second line: the first name in full, the last name as its initial -
 * "Alex Ball" -> "Alex B.". A single name stays as it is.
 */
export function shortLeaderName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0]} ${parts.at(-1)!.charAt(0).toLocaleUpperCase("en-US")}.`;
}
