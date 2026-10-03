import "server-only";

import ExcelJS from "exceljs";

import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime } from "@/lib/service-time";
import { serviceSlots } from "@/lib/song-list";
import { firstYear, layoutMonth, printedServiceDate } from "@/lib/song-list-pdf";
import type { Service, SongListMonth } from "@/types/song-list";

import { RAW_COLUMNS, type RawRow } from "./export";

/**
 * The spreadsheet exports, written with exceljs. Both open cleanly in Excel
 * and Google Sheets, and both are copies - editing them changes nothing here.
 *
 *   raw         one row per song, a frozen header and filters: for analysis
 *   formatted   one sheet per month, laid out like the song list's PDF - two
 *               columns of service blocks - and still an ordinary, editable
 *               spreadsheet
 */

const INK = "FF111111";
const MUTED = "FF6B6B68";
const LINE = "FFE5E5E2";
const GOLD = "FFB08D57";

function workbook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = siteConfig.name;
  book.company = siteConfig.church.name;
  book.created = new Date();
  return book;
}

/** The raw export: one row per scheduled song. */
export async function rawWorkbook(rows: readonly RawRow[]): Promise<Buffer> {
  const book = workbook();
  const sheet = book.addWorksheet("Songs", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = RAW_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).border = { bottom: { style: "thin", color: { argb: INK } } };
  for (const row of rows) sheet.addRow(row);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: RAW_COLUMNS.length } };
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ and unique. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Songs";
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base.slice(0, 28)} ${n}`;
  used.add(name);
  return name;
}

/** The formatted export: each month as a sheet that reads like the printed song list. */
export async function formattedWorkbook(months: readonly SongListMonth[]): Promise<Buffer> {
  const book = workbook();
  const used = new Set<string>();

  for (const month of months) {
    const sheet = book.addWorksheet(sheetName(month.title, used), {
      pageSetup: {
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
      views: [{ showGridLines: false }],
    });
    // Number, title, key | gap | number, title, key - as the sheet always was.
    sheet.columns = [
      { width: 6 },
      { width: 34 },
      { width: 8 },
      { width: 3 },
      { width: 6 },
      { width: 34 },
      { width: 8 },
    ];

    const heading = month.heading ?? month.title;
    const year = firstYear(month);
    sheet.mergeCells("A1:G1");
    sheet.getCell("A1").value = heading;
    sheet.getCell("A1").font = { name: "Georgia", size: 18, bold: true, color: { argb: INK } };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:G2");
    sheet.getCell("A2").value = `${siteConfig.church.name}${year ? ` · ${year}` : ""}`;
    sheet.getCell("A2").font = { size: 10, color: { argb: MUTED } };
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.getRow(2).border = { bottom: { style: "thin", color: { argb: GOLD } } };

    const { left, right } = layoutMonth(month);
    writeColumn(sheet, left, 4, 1);
    writeColumn(sheet, right, 4, 5);
  }

  if (months.length === 0) book.addWorksheet("Songs");
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Writes services down one column block from `startRow`; returns the row after the last one. */
function writeColumn(sheet: ExcelJS.Worksheet, services: readonly Service[], startRow: number, firstColumn: number): number {
  let row = startRow;
  for (const service of services) {
    const date = printedServiceDate(service);
    const time = service.startsAt ? ` · ${formatChurchTime(service.startsAt)}` : "";

    sheet.mergeCells(row, firstColumn + 1, row, firstColumn + 2);
    const slotCell = sheet.getCell(row, firstColumn);
    slotCell.value = service.slot ?? "";
    slotCell.font = { bold: true, size: 9, color: { argb: GOLD } };
    const dateCell = sheet.getCell(row, firstColumn + 1);
    dateCell.value = `${date}${time}`;
    dateCell.font = { bold: true, size: 11, color: { argb: INK } };
    for (let column = firstColumn; column <= firstColumn + 2; column += 1) {
      sheet.getCell(row, column).border = { bottom: { style: "thin", color: { argb: GOLD } } };
    }
    row += 1;

    for (const song of serviceSlots(service)) {
      const cells = [sheet.getCell(row, firstColumn), sheet.getCell(row, firstColumn + 1), sheet.getCell(row, firstColumn + 2)];
      if (song) {
        cells[0].value = song.number ?? "";
        cells[1].value = song.title;
        cells[2].value = song.key ?? "";
        cells[1].font = { size: 10, color: { argb: INK } };
      } else {
        cells[1].value = songListContent.states.pendingSong;
        cells[1].font = { size: 10, italic: true, color: { argb: MUTED } };
      }
      cells[0].font = { size: 9, color: { argb: MUTED } };
      cells[2].font = { size: 10, color: { argb: INK } };
      cells[0].alignment = { horizontal: "right" };
      cells[2].alignment = { horizontal: "center" };
      for (const cell of cells) cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
      row += 1;
    }
    row += 1;
  }
  return row;
}
