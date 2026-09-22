import "server-only";

import { siteConfig } from "@/config/site";
import { parseMonthGrid } from "@/lib/song-list";
import type { SongListMonth, SongListResult } from "@/types/song-list";

/**
 * All Google-specific code lives here. Nothing else in the app knows that the
 * song list comes from Google Sheets - the rest of the app sees only the types
 * in src/types/song-list.ts, so this file could be swapped for a database or a
 * CMS without touching the UI.
 *
 * READ ONLY. This module never writes to the spreadsheet.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SHEETS API RATHER THAN THE CSV EXPORT
 * ---------------------------------------------------------------------------
 * The workbook holds all twelve months, but only the current month's tab is
 * visible - the rest are hidden and still contain last year's dates. The CSV
 * and gviz endpoints serve hidden sheets happily and report nothing about
 * visibility or tab order, so using them would publish eleven hidden tabs and
 * stale data. Only the Sheets API exposes `hidden` and `index`, which is what
 * makes "show the visible tabs, in tab order" possible.
 *
 * ---------------------------------------------------------------------------
 * FRESHNESS
 * ---------------------------------------------------------------------------
 * Both requests are cached for siteConfig.songList.revalidateSeconds (60s).
 * Editing the spreadsheet is reflected on the site within about a minute, with
 * no code change, no build and no redeploy. Nothing is baked into the build.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Columns A-G; column D is the spacer between the two service blocks. */
const CELL_RANGE = "A1:G400";

interface SheetProperties {
  title?: string;
  index?: number;
  /** Google omits this entirely for visible sheets. */
  hidden?: boolean;
}

interface SpreadsheetMetadata {
  sheets?: Array<{ properties?: SheetProperties }>;
}

interface BatchGetResponse {
  valueRanges?: Array<{ values?: string[][] }>;
}

/**
 * The API key travels in a header rather than the query string, so it cannot
 * end up in a proxy log, an error message or a stack trace containing the URL.
 */
function requestInit(apiKey: string): RequestInit {
  return {
    headers: {
      "X-Goog-Api-Key": apiKey,
      Accept: "application/json",
    },
    next: { revalidate: siteConfig.songList.revalidateSeconds },
  };
}

async function requestJson<T>(url: string, apiKey: string): Promise<T> {
  const response = await fetch(url, requestInit(apiKey));

  if (!response.ok) {
    // Status only. The response body is never surfaced or logged, so nothing
    // Google echoes back can leak into our logs or to a visitor.
    throw new Error(`Google Sheets responded with ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * The visible worksheet tabs, in the spreadsheet's own tab order, capped at
 * siteConfig.songList.maxMonths.
 *
 * Tab 1 is the current month; tab 2, when present, is the upcoming month.
 * Hidden tabs are dropped and never reach the website.
 */
async function fetchVisibleSheetTitles(apiKey: string): Promise<string[]> {
  const url = `${SHEETS_API}/${siteConfig.songList.spreadsheetId}?fields=sheets.properties(title,index,hidden)`;
  const data = await requestJson<SpreadsheetMetadata>(url, apiKey);

  return (data.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is SheetProperties => Boolean(properties))
    .filter((properties) => properties.hidden !== true)
    .filter((properties) => Boolean(properties.title))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, siteConfig.songList.maxMonths)
    .map((properties) => properties.title as string);
}

/** A sheet title inside an A1 range is single-quoted; inner quotes double up. */
function toRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'!${CELL_RANGE}`;
}

/**
 * Cell values for the given tabs, in the same order they were requested.
 *
 * FORMATTED_VALUE returns what the spreadsheet actually displays, so cells
 * driven by formulas (IMPORTRANGE and friends) arrive already resolved. The
 * site never sees or parses a formula.
 */
async function fetchGrids(apiKey: string, titles: string[]): Promise<string[][][]> {
  const params = new URLSearchParams();
  for (const title of titles) params.append("ranges", toRange(title));
  params.set("valueRenderOption", "FORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");
  params.set("majorDimension", "ROWS");

  const url = `${SHEETS_API}/${siteConfig.songList.spreadsheetId}/values:batchGet?${params}`;
  const data = await requestJson<BatchGetResponse>(url, apiKey);

  return titles.map((_, index) => data.valueRanges?.[index]?.values ?? []);
}

/**
 * The song list, ready for rendering.
 *
 * Never throws: a missing key or an unreachable Google degrades to an error
 * state on the page, so the rest of the site stays up.
 */
export async function getSongList(): Promise<SongListResult> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

  if (!apiKey) {
    return { ok: false, reason: "not-configured" };
  }

  try {
    const titles = await fetchVisibleSheetTitles(apiKey);

    if (titles.length === 0) {
      return { ok: true, months: [] };
    }

    const grids = await fetchGrids(apiKey, titles);
    const months: SongListMonth[] = titles.map((title, index) =>
      parseMonthGrid(title, grids[index] ?? []),
    );

    return { ok: true, months };
  } catch (error) {
    console.error(
      "[song-list] Could not load the schedule from Google Sheets:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, reason: "unavailable" };
  }
}
