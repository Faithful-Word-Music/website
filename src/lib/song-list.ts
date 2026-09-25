import { songListContent } from "@/content/song-list";
import { parseDateLabel, parseSlot, startsAtFor } from "@/lib/service-time";
import type {
  DatedService,
  Service,
  ServiceSlot,
  Song,
  SongListMonth,
} from "@/types/song-list";

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
 *          left block: A B C                 D    right block: E F G
 *   Row 2:  "PM" "Wednesday, September 2, 2026" "" | "AM" "Sunday, September 20, 2026" ""
 *   Row 3:  "233" "Tell Me the Old, Old Story" "C" | "161" "Our Great Saviour" "F"
 *   Row 4:  "323" "More About Jesus" "Ab"          | ...
 *   Row 5:  ""    "This World is Not My Home" "F"  |  <- a song with NO hymnal number
 *   ...
 *   Last:   "**Songs and Keys are subject to change**"   <- a note, column A only
 *
 * Two independent column blocks run side by side purely to fit a month on one
 * printed page. Column D is an empty spacer. The left block holds the earlier
 * half of the month, so reading the left block fully and then the right block
 * yields chronological order.
 *
 * ---------------------------------------------------------------------------
 * TELLING ROWS APART
 * ---------------------------------------------------------------------------
 * A date row has "AM" or "PM" in the number column, the date in the title
 * column, and NO key. Every song has a key. So:
 *
 *   date header -> title present AND key empty AND (number is AM/PM OR empty)
 *   song row    -> title present AND (number is a hymn number OR key present)
 *
 * The empty-number case keeps an unmarked date row working. Anything else
 * (blank rows, stray notes) is ignored.
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
 * Values that mean "nothing here yet" rather than real data:
 *
 *   - spreadsheet formula errors - a lookup with nothing to find shows #N/A,
 *     a broken reference #REF!, and so on
 *   - placeholders typed in by hand: TBD, TBA, "?"
 *   - "Loading..." from a formula that had not finished when the sheet was read
 *
 * They are read as empty cells, so they can never become a song title, a
 * hymnal number or a key.
 */
const PLACEHOLDER =
  /^(#(N\/A|REF!|VALUE!|ERROR!|NAME\?|DIV\/0!|NUM!|NULL!|SPILL!|CALC!)|TBD|TBA|\?+|loading\.*)$/i;

export function isPlaceholder(value: string | null | undefined): boolean {
  return value != null && PLACEHOLDER.test(value.trim());
}

/** A cell's value, with placeholders and formula errors read as empty. */
function dataCell(row: readonly string[] | undefined, index: number): string {
  const value = cell(row, index);
  return isPlaceholder(value) ? "" : value;
}

/**
 * A song as stored or parsed, with any placeholder parts removed. Returns
 * null when the title itself was a placeholder: an unfilled slot, not a song.
 */
export function cleanSong(song: Song): Song | null {
  if (isPlaceholder(song.title) || song.title.trim() === "") return null;
  return {
    title: song.title,
    number: isPlaceholder(song.number) ? null : song.number,
    key: isPlaceholder(song.key) ? null : song.key,
  };
}

/**
 * Parses one worksheet grid into a month.
 *
 * @param title Worksheet tab title, used verbatim as the UI label.
 * @param grid  Rows of formatted cell values, as returned by Google Sheets.
 */
export function parseMonthGrid(title: string, grid: string[][]): SongListMonth {
  const heading = cell(grid[0], 0).replace(/\s+/g, " ") || null;
  const services: Service[] = [];

  for (const [blockIndex, block] of COLUMN_BLOCKS.entries()) {
    const [numberCol, titleCol, keyCol] = block;
    let current: Service | null = null;

    // Start at row index 1: row 0 is the in-sheet heading.
    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      const number = dataCell(row, numberCol);
      const songTitle = dataCell(row, titleCol);
      const key = dataCell(row, keyCol);

      if (songTitle === "") {
        // A row that had something in it, but only placeholders ("TBD",
        // "#N/A"), is a song slot not filled in yet. Counted, not shown as a song.
        // Only a real placeholder counts: other text here (such as the sheet's
        // footnote in column A) is not a song slot.
        const hadPlaceholder = [numberCol, titleCol, keyCol].some((index) =>
          isPlaceholder(cell(row, index)),
        );
        if (hadPlaceholder && current) current.pendingSongs += 1;
        continue;
      }

      const marker = parseSlot(number);
      const isDateHeader = key === "" && (number === "" || marker !== null);

      if (isDateHeader) {
        current = {
          id: `${blockIndex}-${rowIndex}`,
          dateLabel: songTitle,
          serviceLabel: marker ? songListContent.serviceMarkerLabels[marker] : null,
          slot: marker,
          date: parseDateLabel(songTitle),
          startsAt: null,
          songs: [],
          pendingSongs: 0,
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
          slot: null,
          date: null,
          startsAt: null,
          songs: [],
          pendingSongs: 0,
        };
        services.push(current);
      }

      current.songs.push(song);
    }
  }

  // A service with no songs and no unfilled slots is an artefact, not a service.
  // One whose slots are all still "TBD" is real - just not planned yet.
  const populated = services.filter(
    (service) => service.songs.length > 0 || service.pendingSongs > 0,
  );

  return {
    title,
    heading,
    note: findNote(grid),
    services: labelUnmarkedServices(populated).map(withStartTime),
    fallbackRows: populated.length === 0 ? buildFallbackRows(grid) : null,
  };
}

function withStartTime(service: Service): Service {
  return service.date && service.slot
    ? { ...service, startsAt: startsAtFor(service.date, service.slot) }
    : service;
}

/**
 * A footnote in column A with nothing beside it, such as
 * "**Songs and Keys are subject to change**". Markdown-style asterisks are
 * stripped; the last such line in the sheet wins.
 */
function findNote(grid: string[][]): string | null {
  let note: string | null = null;

  for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    const text = cell(row, 0);
    const restEmpty = [1, 2, 4, 5, 6].every((index) => cell(row, index) === "");
    if (text !== "" && restEmpty && /[a-z]/i.test(text) && parseSlot(text) === null) {
      note = text.replace(/^[*_\s]+|[*_\s]+$/g, "") || null;
    }
  }

  return note;
}

/**
 * The sheet normally marks every date AM or PM, one of each on a Sunday. When
 * a date's two services cannot be told apart - both unmarked, or both given
 * the same marker by a slip of the keyboard (it has happened: January 18 was
 * marked AM twice) - they are taken in sheet order, Morning then Evening. The
 * sheet always lists the morning service first. Without this, the second
 * service would overwrite the first in the archive.
 *
 * Three or more unmarked services on one date are simply numbered. The label
 * strings live in src/content/song-list.ts.
 */
function labelUnmarkedServices(services: Service[]): Service[] {
  const byDate = new Map<string, Service[]>();
  for (const service of services) {
    if (service.dateLabel === "") continue;
    byDate.set(service.dateLabel, [...(byDate.get(service.dateLabel) ?? []), service]);
  }

  const replacements = new Map<Service, Service>();
  const { repeatedServiceLabels, numberedServicePrefix } = songListContent;
  const slotsInOrder: ServiceSlot[] = ["AM", "PM"];

  for (const group of byDate.values()) {
    if (group.length === 2 && group[0].slot === group[1].slot) {
      group.forEach((service, occurrence) => {
        replacements.set(service, {
          ...service,
          serviceLabel: repeatedServiceLabels[occurrence] ?? null,
          slot: slotsInOrder[occurrence],
        });
      });
    } else if (group.length > 2) {
      group
        .filter((service) => !service.slot)
        .forEach((service, occurrence) => {
          replacements.set(service, {
            ...service,
            serviceLabel: `${numberedServicePrefix} ${occurrence + 1}`,
          });
        });
    }
  }

  return services.map((service) => replacements.get(service) ?? service);
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

/** The services of these months that can be placed in time. */
export function datedServices(months: SongListMonth[]): DatedService[] {
  const result: DatedService[] = [];
  for (const month of months) {
    for (const service of month.services) {
      // Only real songs are history; a service still all "TBD" has none yet.
      if (service.date && service.slot && service.startsAt && service.songs.length > 0) {
        result.push({
          date: service.date,
          slot: service.slot,
          startsAt: service.startsAt,
          songs: service.songs,
        });
      }
    }
  }
  return result;
}

/**
 * The identity of a song across the whole history: its title, lowercased,
 * with punctuation and spacing dropped - so "Hallelujah, 'Tis Done" and
 * "Hallelujah 'Tis Done" count as the same song.
 */
export function songKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The song's address in the archive: its identity with hyphens, so
 * "Hallelujah, 'Tis Done" lives at /song-list/archive/hallelujah-tis-done.
 * One song, one address, however its title was punctuated in the sheet.
 */
export function songSlug(title: string): string {
  return songKey(title).replace(/ /g, "-");
}

/**
 * Musical keys compare loosely: "ab", "Ab ", "A♭" and "A flat" are the same
 * key, as are "Cm", "C minor" and "C min".
 */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/\s*flat\b/g, "b")
    .replace(/\s*sharp\b/g, "#")
    .replace(/\s*(minor|min)\b/g, "m")
    .replace(/\s*(major|maj)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a key typed into the key box matches a song's key.
 *
 *   exact              "Ab" -> Ab
 *   the key plus mode  "C"  -> C and C Dorian (a C Dorian tune is still in C),
 *                              but not Cm or C# - those are different keys
 *   a partial mode     "C Dor" -> C Dorian
 */
export function keyMatches(songKeyValue: string, typed: string): boolean {
  const key = normalizeKey(songKeyValue);
  const wanted = normalizeKey(typed);
  if (wanted === "") return true;
  if (key === wanted || key.startsWith(`${wanted} `)) return true;
  return wanted.includes(" ") && key.startsWith(wanted);
}

/** Total songs in a list of services, used for the search results announcement. */
export function countSongs(services: Service[]): number {
  return services.reduce((total, service) => total + service.songs.length, 0);
}

export interface SongFilter {
  /** Matches the title anywhere, or the hymnal number from its start ("#23" finds 233). */
  query: string;
  /** Musical key as typed into the key box, or "" for any. See keyMatches(). */
  key: string;
}

/** Whether a song passes the filter. Shared by the schedule and the archive. */
export function matchesSong(
  song: { title: string; number: string | null; keys: ReadonlyArray<string | null> },
  filter: SongFilter,
): boolean {
  if (filter.key.trim() !== "") {
    if (!song.keys.some((key) => key !== null && keyMatches(key, filter.key))) return false;
  }

  const needle = filter.query.trim().toLowerCase();
  if (needle === "") return true;

  const numberNeedle = needle.replace(/^(#|no\.?)\s*/, "");
  if (/^\d+[a-z]?$/.test(numberNeedle) && song.number?.toLowerCase().startsWith(numberNeedle)) {
    return true;
  }

  return songKey(song.title).includes(songKey(needle)) || song.title.toLowerCase().includes(needle);
}

/**
 * Filters services by the search box and key selector.
 *
 * Services keep only their matching songs, and a service with no match drops
 * out entirely - so the result reads as "here is where we sing that song".
 */
export function filterServices(services: Service[], filter: SongFilter): Service[] {
  if (filter.query.trim() === "" && filter.key.trim() === "") return services;

  return services
    .map((service) => ({
      ...service,
      songs: service.songs.filter((song) =>
        matchesSong({ title: song.title, number: song.number, keys: [song.key] }, filter),
      ),
      // Unfilled slots never match a search.
      pendingSongs: 0,
    }))
    .filter((service) => service.songs.length > 0);
}

/**
 * Every distinct key in these services, for the key selector - in the order a
 * musician reads them round the circle (C, Db, D, ...), then anything unusual
 * ("C Dorian") alphabetically after.
 */
export function listKeys(keys: Iterable<string | null>): string[] {
  const byNormalized = new Map<string, string>();
  for (const key of keys) {
    if (!key) continue;
    const normalized = normalizeKey(key);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, key.trim());
  }

  const order = ["c", "c#", "db", "d", "d#", "eb", "e", "f", "f#", "gb", "g", "g#", "ab", "a", "a#", "bb", "b"];
  const rank = (normalized: string) => {
    const tonic = normalized.replace(/m$/, "");
    const index = order.indexOf(tonic);
    if (index < 0) return 1000;
    // Majors first, then the minor of the same tonic.
    return index * 2 + (normalized.endsWith("m") ? 1 : 0);
  };

  return [...byNormalized.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([, display]) => display);
}
