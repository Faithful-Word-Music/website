import { songListContent } from "@/content/song-list";
import type { Service, Song, SongListMonth } from "@/types/song-list";

/**
 * Turns a raw worksheet grid into a normalized month of services.
 *
 * ---------------------------------------------------------------------------
 * THE SHEET'S LAYOUT
 * ---------------------------------------------------------------------------
 * Each month tab is a service schedule, not a flat table:
 *
 *   Row 1: "September Song List"            <- in-sheet heading, column A
 *
 *          left block: A B C        D        right block: E F G
 *   Row 2:  ""  "Wednesday, September 2, 2026"  ""   |  ""   "Sunday, September 20, 2026"  ""
 *   Row 3:  "233"  "Tell Me the Old, Old Story"  "C" |  "161"  "Our Great Saviour"  "F"
 *   Row 4:  "323"  "More About Jesus"  "Ab"          |  ...
 *   Row 5:  ""  "This World is Not My Home"  "F"     |  <- a song with NO hymnal number
 *   ...
 *
 * Two independent column blocks run side by side purely to fit a month on one
 * printed page. Column D is an empty spacer. The left block holds the earlier
 * half of the month, so reading the left block fully and then the right block
 * yields chronological order.
 *
 * ---------------------------------------------------------------------------
 * TELLING ROWS APART
 * ---------------------------------------------------------------------------
 * The subtle part: a date header AND a song-without-a-number both have an empty
 * first cell, so the first cell alone cannot distinguish them. The key is the
 * third cell (the musical key), which every song has and no date header has:
 *
 *   date header -> number empty AND key empty AND title present
 *   song row    -> title present AND (number present OR key present)
 *
 * Anything else (fully blank rows, stray notes) is ignored.
 */

/** Column triples: [number, title, key] for the left and right blocks. */
const COLUMN_BLOCKS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [4, 5, 6],
];

/** Total columns a row is padded to. Sheets omits trailing empty cells. */
const COLUMN_COUNT = 7;

function cell(row: readonly string[] | undefined, index: number): string {
  const value = row?.[index];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parses one worksheet grid into a month.
 *
 * @param title Worksheet tab title, used verbatim as the UI label.
 * @param grid  Rows of formatted cell values, as returned by Google Sheets.
 */
export function parseMonthGrid(title: string, grid: string[][]): SongListMonth {
  const heading = cell(grid[0], 0) || null;
  const services: Service[] = [];

  for (const [blockIndex, block] of COLUMN_BLOCKS.entries()) {
    const [numberCol, titleCol, keyCol] = block;
    let current: Service | null = null;

    // Start at row index 1: row 0 is the in-sheet heading.
    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      const number = cell(row, numberCol);
      const songTitle = cell(row, titleCol);
      const key = cell(row, keyCol);

      if (songTitle === "") continue;

      const isDateHeader = number === "" && key === "";

      if (isDateHeader) {
        current = {
          id: `${blockIndex}-${rowIndex}`,
          dateLabel: songTitle,
          serviceLabel: null,
          songs: [],
        };
        services.push(current);
        continue;
      }

      const song: Song = {
        number: number === "" ? null : number,
        title: songTitle,
        key: key === "" ? null : key,
      };

      if (current === null) {
        // Songs before any date header: keep the data rather than drop it.
        current = {
          id: `${blockIndex}-${rowIndex}`,
          dateLabel: "",
          serviceLabel: null,
          songs: [],
        };
        services.push(current);
      }

      current.songs.push(song);
    }
  }

  // A service that never received a song is an artefact, not a service.
  const populated = services.filter((service) => service.songs.length > 0);

  return {
    title,
    heading,
    services: labelRepeatedDates(populated),
    fallbackRows: populated.length === 0 ? buildFallbackRows(grid) : null,
  };
}

/**
 * Sundays hold two services, so the same date appears twice. The sheet gives
 * them no names, so they are labelled here. The label strings live in
 * src/content/song-list.ts so they can be reworded without touching logic.
 */
function labelRepeatedDates(services: Service[]): Service[] {
  const counts = new Map<string, number>();
  for (const service of services) {
    if (service.dateLabel === "") continue;
    counts.set(service.dateLabel, (counts.get(service.dateLabel) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const { repeatedServiceLabels } = songListContent;

  return services.map((service) => {
    const total = counts.get(service.dateLabel) ?? 0;
    if (total < 2) return service;

    const occurrence = seen.get(service.dateLabel) ?? 0;
    seen.set(service.dateLabel, occurrence + 1);

    const serviceLabel =
      total === 2
        ? repeatedServiceLabels[occurrence] ?? null
        : `${songListContent.numberedServicePrefix} ${occurrence + 1}`;

    return { ...service, serviceLabel };
  });
}

/**
 * Last resort when the layout stops matching: hand back every non-empty row so
 * the page can render a plain table. Showing the data unstyled beats showing
 * an empty page and pretending the month has no songs.
 */
function buildFallbackRows(grid: string[][]): string[][] | null {
  const rows = grid
    .map((row) =>
      Array.from({ length: COLUMN_COUNT }, (_, index) => cell(row, index)),
    )
    .filter((row) => row.some((value) => value !== ""));

  return rows.length > 0 ? rows : null;
}

/** Total songs in a month, used for the search results announcement. */
export function countSongs(services: Service[]): number {
  return services.reduce((total, service) => total + service.songs.length, 0);
}

/**
 * Filters a month by a search query, matching song title, hymnal number or key.
 *
 * Services keep only their matching songs, and a service with no match drops
 * out entirely - so the result reads as "here is where we sing that song".
 */
export function filterServices(services: Service[], query: string): Service[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return services;

  const matches = (song: Song) =>
    song.title.toLowerCase().includes(needle) ||
    (song.number?.toLowerCase().includes(needle) ?? false) ||
    (song.key?.toLowerCase().includes(needle) ?? false);

  return services
    .map((service) => ({ ...service, songs: service.songs.filter(matches) }))
    .filter((service) => service.songs.length > 0);
}
