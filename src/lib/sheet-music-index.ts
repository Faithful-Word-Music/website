import "server-only";

import { unstable_cache } from "next/cache";

import { siteConfig } from "@/config/site";
import { getGoogleAccessToken, isGoogleConfigured } from "@/lib/google-auth";
import { sheetMusicTypesForSite } from "@/lib/auth/store";
import {
  classify,
  type DriveItem,
  readSheetMusic,
  type SheetMusicIndex,
  type SheetMusicSources,
} from "@/lib/sheet-music";

/**
 * Reading the private Sheet Music Index and the private Drive folders, and
 * fetching files. Everything Google-specific about sheet music lives here.
 *
 * READ ONLY. Only the Songs tab and the optional Versions tab are read;
 * Migration, References and the other tabs never leave Google. The files
 * come from one listing of everything shared with the service account
 * (the "Sheet Music" folder) - a handful of requests, cached, never per page
 * view. See src/lib/sheet-music.ts for how folders and names are read.
 *
 * All of it is cached for siteConfig.sheetMusic.revalidateSeconds, so a file
 * dropped into Drive or an edit to the sheet reaches the song pages within a
 * few seconds, and most page views cost no Google request at all.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

const SONGS_TAB = "Songs";
/** The optional per-version tab, under its current name or its older one. */
const VERSIONS_TABS = ["Versions", "Editions"];
const COLUMNS = "A1:Z";

export const SHEET_MUSIC_TAG = "sheet-music-index";

export type SheetMusicErrorReason =
  /** GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY are not set. */
  | "not-configured"
  /** Google refused or could not be reached, or the Index was unreadable. */
  | "unavailable";

export type SheetMusicResult =
  | { ok: true; index: SheetMusicIndex }
  | { ok: false; reason: SheetMusicErrorReason };

export type SheetMusicSourcesResult =
  | { ok: true; sources: SheetMusicSources }
  | { ok: false; reason: SheetMusicErrorReason };

async function authorizedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Google credentials are not set");
  return fetch(url, {
    ...init,
    // The token changes hourly and responses are cached above this layer.
    cache: "no-store",
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}

async function requestJson<T>(url: string, service: string): Promise<T> {
  const response = await authorizedFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    // Status only; nothing Google echoes back is logged.
    throw new Error(`${service} responded with ${response.status}`);
  }
  return (await response.json()) as T;
}

interface SpreadsheetMetadata {
  sheets?: Array<{ properties?: { title?: string } }>;
}

interface BatchGetResponse {
  valueRanges?: Array<{ values?: string[][] }>;
}

/** The Songs tab, and the Versions tab if the sheet has one. */
async function fetchTabs(): Promise<{ songs: string[][]; versions: string[][] }> {
  const spreadsheet = `${SHEETS_API}/${siteConfig.sheetMusic.indexSpreadsheetId}`;
  const metadata = await requestJson<SpreadsheetMetadata>(
    `${spreadsheet}?fields=sheets.properties.title`,
    "Google Sheets",
  );
  const titles = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
  const versionsTab = VERSIONS_TABS.find((title) => titles.has(title));

  const params = new URLSearchParams();
  params.append("ranges", `'${SONGS_TAB}'!${COLUMNS}`);
  if (versionsTab) params.append("ranges", `'${versionsTab}'!${COLUMNS}`);
  params.set("valueRenderOption", "FORMATTED_VALUE");
  params.set("majorDimension", "ROWS");

  const data = await requestJson<BatchGetResponse>(`${spreadsheet}/values:batchGet?${params}`, "Google Sheets");
  return {
    songs: data.valueRanges?.[0]?.values ?? [],
    versions: versionsTab ? (data.valueRanges?.[1]?.values ?? []) : [],
  };
}

interface DriveListResponse {
  files?: DriveItem[];
  nextPageToken?: string;
}

/** Guards against a runaway listing; ~2,000 items today is 2 pages. */
const MAX_DRIVE_PAGES = 20;

/**
 * Every file and folder shared with the service account, in pages of 1,000.
 * Only the fields the site uses are requested, so the cached index stays small.
 */
async function listDrive(): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_DRIVE_PAGES; page += 1) {
    const params = new URLSearchParams({
      q: "trashed = false",
      // md5Checksum is what lets the library index skip a file it has already read, without opening it.
      fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime,md5Checksum)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await requestJson<DriveListResponse>(`${DRIVE_API}?${params}`, "Google Drive");
    items.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return items;
}

async function fetchSources(): Promise<SheetMusicSources> {
  const [tabs, drive] = await Promise.all([fetchTabs(), listDrive()]);
  const sources = readSheetMusic({ songs: tabs.songs, versions: tabs.versions, drive });
  if (sources.songs.length === 0) throw new Error("The Index has no readable Songs rows");
  return sources;
}

/** Failures are not cached, so a fixed sheet or key is picked up on the next visit. */
const getCachedSources = unstable_cache(fetchSources, ["sheet-music-sources"], {
  tags: [SHEET_MUSIC_TAG],
  revalidate: siteConfig.sheetMusic.revalidateSeconds,
});

/**
 * Everything read from the Index and Drive, before files are sorted into
 * types - for Admin -> Configuration, which browses the folders.
 *
 * Never throws: when the service account is not set up yet, or Google is
 * unreachable, callers get a reason instead.
 */
export async function getSheetMusicSources(): Promise<SheetMusicSourcesResult> {
  if (!isGoogleConfigured()) {
    return { ok: false, reason: "not-configured" };
  }

  try {
    return { ok: true, sources: await getCachedSources() };
  } catch (error) {
    console.error(
      "[sheet-music] Could not load the Sheet Music Index:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * The Sheet Music Index, with every file sorted into the sheet music types
 * set up under Admin -> Configuration (the defaults when they cannot be
 * read). The Google read is cached; the sorting is redone on each call, so
 * a change to the types shows at once.
 *
 * Never throws: when the service account is not set up yet, or Google is
 * unreachable, callers get a reason and the song pages simply leave the
 * sheet-music section out.
 */
export async function getSheetMusicIndex(): Promise<SheetMusicResult> {
  const [sources, types] = await Promise.all([getSheetMusicSources(), sheetMusicTypesForSite()]);
  if (!sources.ok) return sources;
  return { ok: true, index: classify(sources.sources, types) };
}

/**
 * A whole file from Drive, for the server's own reading (the library index
 * reads lyrics out of MuseScore files - src/lib/library-content). Never sent
 * to a browser. Throws when Drive will not give it, or it is larger than
 * `maxBytes`; the message carries the status only, never the file's ID.
 */
export async function readDriveFile(driveFileId: string, maxBytes: number): Promise<Uint8Array> {
  const response = await authorizedFetch(`${DRIVE_API}/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`);
  if (!response.ok) throw new Error(`Google Drive responded with ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw new Error("The file is too large to read.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("The file is too large to read.");
  return bytes;
}

/**
 * The file's bytes from Drive, as a stream, or null when Drive will not give
 * them. Call ONLY after canAccessFile() has allowed it.
 *
 * supportsAllDrives lets the same code read from a shared drive if the music
 * ever moves to one.
 */
export async function openDriveFile(driveFileId: string): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const response = await authorizedFetch(
      `${DRIVE_API}/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
    );
    if (!response.ok || !response.body) {
      // The status says enough (404: not shared with the service account or
      // deleted; 403: downloads disabled or quota). The ID is not logged.
      console.error(`[sheet-music] Google Drive responded with ${response.status}`);
      return null;
    }
    return response.body;
  } catch (error) {
    console.error(
      "[sheet-music] Could not reach Google Drive:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
