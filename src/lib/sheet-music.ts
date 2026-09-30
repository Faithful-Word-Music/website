import { songKey } from "@/lib/song-list";

/**
 * Sheet music: the songs in the Sheet Music Index, with the files found in
 * the Drive folders. Pure functions only - the fetching lives in
 * src/lib/sheet-music-index.ts.
 *
 * ---------------------------------------------------------------------------
 * WHERE EACH PIECE COMES FROM
 * ---------------------------------------------------------------------------
 *   The Drive folders   the files. A file's folder and name say everything:
 *                       collection, Standard / Chords / Capo, hymn number,
 *                       title and version. Dropping a file in is all it takes.
 *   Songs tab           one row per song: details, and "Copyrighted?", which
 *                       decides whether its files may be shared.
 *   Versions tab        optional: a key or capo fret for one version. Called
 *                       "Editions" in older copies; either name works.
 *
 * The folder layout, below "Sheet Music/":
 *
 *   01 - Congregational/[Hymnals/]<Collection>/Standard/<PDF|MuseScore>/
 *   01 - Congregational/[Hymnals/]<Collection>/Chords/Standard/<PDF|MuseScore>/
 *   01 - Congregational/[Hymnals/]<Collection>/Chords/Capo/<PDF|MuseScore>/   (guitar)
 *   02 - Instrument Parts/<Instrument>/<Collection>/<PDF|MuseScore>/
 *   03 - Ensemble & Classical/<Collection>/<PDF|MuseScore>/
 *   90 - Reference/...                     never used (complete hymnals)
 *
 * and the file names:
 *
 *   "121 - Like a River Glorious.pdf"      hymn 121 (also "121 Title", "014 - Title")
 *   "Psalm 54.mscz"                        no number: matched by title
 *   "... (2).pdf"                          version 2; no number means version 1
 *   "Psalm 58 (Stedfast Baptist Church).pdf"   other notes in brackets are ignored
 *   "... IN PROGRESS ..."                  a draft: never shown
 *
 * Drive File IDs stay on the server: the browser only ever sees a file's
 * slug, and the file route looks the ID up again after checking rights.
 */

/**
 * What the Index's "Copyrighted?" column says. Only "No" clears a song's
 * files for the public; everything else, including a blank or a value
 * nobody expected, keeps them private.
 */
export type Rights = "cleared" | "copyrighted" | "needs-review" | "unknown";

export type SheetFormat = "pdf" | "musescore";

export interface SheetFile {
  format: SheetFormat;
  instrument: string | null;
  /** Unique within its song, e.g. "standard-1.pdf" or "capo-2-guitar.mscz". */
  slug: string;
  /** SERVER ONLY. Never include in anything sent to the browser. */
  driveFileId: string;
}

/** One chart of a song: a variant (Standard, Chords, Capo) in one version. */
export interface SongVersion {
  variant: string;
  /** "1", "2"... - from " (2)" at the end of a file name. */
  version: string;
  keys: string | null;
  capoFret: string | null;
  /** PDF first, then MuseScore. */
  files: SheetFile[];
}

export interface IndexSong {
  id: string;
  title: string;
  composer: string | null;
  lyricist: string | null;
  keys: string | null;
  type: string | null;
  collection: string | null;
  hymnNumber: string | null;
  category: string | null;
  occasion: string | null;
  source: string | null;
  rights: Rights;
  versions: SongVersion[];
}

export interface SheetMusicIndex {
  songs: IndexSong[];
}

/** A file or folder as Drive lists it. */
export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
}

/** The folder everything lives under; paths are read from just below it. */
export const ROOT_FOLDER = "Sheet Music";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Song IDs look like "BTH-001", "SSSH1989-233" or "PS-019-7-10". */
const SONG_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/;

/** Written in cells whose value is not known yet. Treated as blank. */
const PLACEHOLDERS = new Set(["?", "-", "—", "n/a", "tbd"]);

function clean(value: string | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" || PLACEHOLDERS.has(text.toLowerCase()) ? null : text;
}

/**
 * The tab as records keyed by lower-cased header. The header is the first
 * row, among the first few, that has one of each group of accepted names;
 * rows above it are ignored.
 */
function readTable(grid: string[][], required: string[][]): Array<Record<string, string | null>> {
  const headerIndex = grid.slice(0, 5).findIndex((row) => {
    const names = new Set(row.map((cell) => clean(cell)?.toLowerCase()));
    return required.every((choices) => choices.some((name) => names.has(name)));
  });
  if (headerIndex === -1) return [];

  const header = grid[headerIndex].map((cell) => clean(cell)?.toLowerCase() ?? "");
  return grid.slice(headerIndex + 1).map((row) => {
    const record: Record<string, string | null> = {};
    header.forEach((name, column) => {
      if (name && !(name in record)) record[name] = clean(row[column]);
    });
    return record;
  });
}

export function rightsFromCell(value: string | null | undefined): Rights {
  switch (clean(value ?? "")?.toLowerCase()) {
    case "no":
      return "cleared";
    case "yes":
      return "copyrighted";
    case "needs review":
      return "needs-review";
    default:
      return "unknown";
  }
}

/**
 * From the file's extension. Drive's MIME type is never consulted: it
 * reports .mscz files - which are zip containers - as zip archives.
 */
export function formatFromName(name: string): SheetFormat | null {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "pdf") return "pdf";
  if (extension === "mscz") return "musescore";
  return null;
}

export const FILE_EXTENSIONS: Record<SheetFormat, string> = { pdf: "pdf", musescore: "mscz" };

/* ------------------------------------------------------------------------ */
/* Reading a file's place in the folders                                    */
/* ------------------------------------------------------------------------ */

export interface DriveSheet {
  collection: string;
  /** Hymn number as written, e.g. "014"; null for songs without one. */
  number: string | null;
  title: string;
  variant: string;
  version: string;
  format: SheetFormat;
  instrument: string | null;
  driveFileId: string;
  modifiedTime: string;
}

const lower = (segments: string[]) => segments.map((segment) => segment.toLowerCase());

/** "(2)", "(Stedfast Baptist Church)", "(Christmas Caroling)" and the space before. */
const BRACKETED = /\s*\(([^()]*)\)/g;

/** A title as matched: case, punctuation and bracketed notes don't count. */
function titleKey(title: string): string {
  return songKey(title.replace(BRACKETED, ""));
}

/**
 * What a file is, from its folders (below "Sheet Music/") and its name.
 * null for anything the website should not use: other file types, drafts,
 * reference material, and folders that follow no known layout.
 */
export function parseDrivePath(
  folders: string[],
  name: string,
  driveFileId: string,
  modifiedTime = "",
): DriveSheet | null {
  const format = formatFromName(name);
  if (!format || /in progress/i.test(name)) return null;

  const [category = "", ...rest] = folders;
  let collection: string | undefined;
  /** The folders below the collection: variant and format. */
  let below: string[] = [];
  let variant = "Standard";
  let instrument: string | null = null;

  if (/congregational/i.test(category)) {
    const inside = rest[0]?.toLowerCase() === "hymnals" ? rest.slice(1) : rest;
    collection = inside[0];
    below = lower(inside.slice(1));
    if (below.includes("capo")) {
      variant = "Capo";
      instrument = "Guitar";
    } else if (below.includes("chords")) {
      variant = "Chords";
    }
  } else if (/instrument parts/i.test(category)) {
    instrument = rest[0] ?? null;
    collection = rest[1];
    below = rest.slice(2);
  } else if (/ensemble|classical/i.test(category)) {
    collection = rest[0];
    below = rest.slice(1);
  }
  // A collection folder always has at least a format folder inside it, so a
  // file sitting directly in one is not in the expected place.
  if (!collection || below.length === 0) return null;

  let base = name.replace(/\.[^.]+$/, "");
  let version = "1";
  base = base.replace(BRACKETED, (_, note: string) => {
    if (/^\s*\d+\s*$/.test(note)) version = String(Number(note));
    return "";
  });

  const numbered = base.match(/^(\d+)(?:\s*-\s*|\s+)(.+)$/);
  const title = (numbered ? numbered[2] : base).trim();
  if (!title) return null;

  return {
    collection,
    number: numbered ? numbered[1] : null,
    title,
    variant,
    version,
    format,
    instrument,
    driveFileId,
    modifiedTime,
  };
}

/**
 * Every usable file in the listing, with its folder path worked out from
 * `parents`. Only what sits inside the "Sheet Music" folder is considered.
 */
export function sheetsFromDrive(items: DriveItem[]): DriveSheet[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sheets: DriveSheet[] = [];

  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) continue;

    const folders: string[] = [];
    let parent = item.parents?.[0] ? byId.get(item.parents[0]) : undefined;
    let insideRoot = false;
    for (let depth = 0; parent && depth < 20; depth += 1) {
      if (parent.name === ROOT_FOLDER) {
        insideRoot = true;
        break;
      }
      folders.unshift(parent.name);
      parent = parent.parents?.[0] ? byId.get(parent.parents[0]) : undefined;
    }
    if (!insideRoot) continue;

    const sheet = parseDrivePath(folders, item.name, item.id, item.modifiedTime);
    if (sheet) sheets.push(sheet);
  }

  return sheets;
}

/* ------------------------------------------------------------------------ */
/* Putting it together                                                      */
/* ------------------------------------------------------------------------ */

/** The Songs and Versions tabs, header rows included, plus the Drive listing. */
export interface IndexSources {
  songs: string[][];
  /** The optional Versions (or older "Editions") tab; may be empty. */
  versions: string[][];
  drive: DriveItem[];
}

/** Hymn numbers compare as numbers when they are: "012" is 12. */
function normalizeNumber(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, "").toLowerCase();
}

/** "(1)" and "1" are the same version. */
function versionNumber(value: string): string {
  return value.match(/^\(?\s*(\d+)\s*\)?$/)?.[1].replace(/^0+(?=\d)/, "") ?? value.toLowerCase();
}

function slugPart(text: string): string {
  return songKey(text).replace(/ /g, "-");
}

const VARIANT_ORDER = ["standard", "chords", "capo"];

function variantRank(variant: string): number {
  const rank = VARIANT_ORDER.indexOf(variant.toLowerCase());
  return rank === -1 ? VARIANT_ORDER.length : rank;
}

function compareVersions(a: SongVersion, b: SongVersion): number {
  return (
    variantRank(a.variant) - variantRank(b.variant) ||
    a.variant.localeCompare(b.variant) ||
    a.version.localeCompare(b.version, undefined, { numeric: true })
  );
}

function parseSongs(grid: string[][]): IndexSong[] {
  const songs = new Map<string, IndexSong>();

  for (const row of readTable(grid, [["song id"], ["title"]])) {
    const id = row["song id"];
    const title = row["title"];
    if (!id || !SONG_ID.test(id) || !title || songs.has(id)) continue;

    songs.set(id, {
      id,
      title,
      composer: row["composer"],
      lyricist: row["lyricist"],
      keys: row["key(s)"],
      type: row["type"],
      collection: row["collection"],
      hymnNumber: row["hymn number"],
      category: row["category"],
      occasion: row["occasion"],
      source: row["source / organization"],
      rights: rightsFromCell(row["copyrighted?"]),
      versions: [],
    });
  }

  return [...songs.values()];
}

/**
 * The Songs tab, with each song's files from Drive and any key or capo
 * from the Versions tab.
 *
 * A file joins its song by collection + hymn number, or - for songs without
 * a number - by collection + title, when exactly one song has that title.
 * A file that matches no song is left out: with no Songs row there is no
 * rights decision, so it could never be shared anyway.
 */
export function parseIndex(sources: IndexSources): SheetMusicIndex {
  const songs = parseSongs(sources.songs);

  const byNumber = new Map<string, IndexSong>();
  const byTitle = new Map<string, IndexSong[]>();
  for (const song of songs) {
    const collection = song.collection?.toLowerCase() ?? "";
    if (song.hymnNumber) byNumber.set(`${collection}|${normalizeNumber(song.hymnNumber)}`, song);
    const key = `${collection}|${titleKey(song.title)}`;
    byTitle.set(key, [...(byTitle.get(key) ?? []), song]);
  }

  const songFor = (sheet: DriveSheet): IndexSong | null => {
    const collection = sheet.collection.toLowerCase();
    if (sheet.number) {
      const found = byNumber.get(`${collection}|${normalizeNumber(sheet.number)}`);
      if (found) return found;
    }
    const titled = byTitle.get(`${collection}|${titleKey(sheet.title)}`) ?? [];
    return titled.length === 1 ? titled[0] : null;
  };

  // One file per song + variant + version + format + instrument. When a file
  // has been copied in twice, the most recently changed copy wins.
  const chosen = new Map<string, { song: IndexSong; sheet: DriveSheet }>();
  for (const sheet of sheetsFromDrive(sources.drive)) {
    const song = songFor(sheet);
    if (!song) continue;
    const key = [song.id, sheet.variant, sheet.version, sheet.format, sheet.instrument ?? ""]
      .join("|")
      .toLowerCase();
    const current = chosen.get(key);
    if (!current || sheet.modifiedTime > current.sheet.modifiedTime) chosen.set(key, { song, sheet });
  }

  for (const { song, sheet } of chosen.values()) {
    let version = song.versions.find(
      (candidate) => candidate.variant === sheet.variant && candidate.version === sheet.version,
    );
    if (!version) {
      version = { variant: sheet.variant, version: sheet.version, keys: null, capoFret: null, files: [] };
      song.versions.push(version);
    }
    version.files.push({
      format: sheet.format,
      instrument: sheet.instrument,
      slug: "",
      driveFileId: sheet.driveFileId,
    });
  }

  // Optional extras: a key or capo fret for a version that has files.
  const songsById = new Map(songs.map((song) => [song.id, song]));
  for (const row of readTable(sources.versions, [["song id"], ["variant"], ["version", "edition"]])) {
    const song = row["song id"] ? songsById.get(row["song id"]) : undefined;
    const variant = row["variant"]?.toLowerCase();
    const number = row["version"] ?? row["edition"];
    if (!song || !variant || !number) continue;

    const version = song.versions.find(
      (candidate) =>
        candidate.variant.toLowerCase() === variant && candidate.version === versionNumber(number),
    );
    if (!version) continue;
    version.keys ??= row["key(s)"];
    version.capoFret ??= row["capo fret"];
  }

  for (const song of songs) {
    song.versions.sort(compareVersions);
    const taken = new Set<string>();

    for (const version of song.versions) {
      version.files.sort(
        (a, b) =>
          (a.format === b.format ? 0 : a.format === "pdf" ? -1 : 1) ||
          (a.instrument ?? "").localeCompare(b.instrument ?? ""),
      );

      for (const file of version.files) {
        const base = [slugPart(version.variant), version.version, file.instrument && slugPart(file.instrument)]
          .filter(Boolean)
          .join("-");
        const extension = FILE_EXTENSIONS[file.format];
        let slug = `${base}.${extension}`;
        for (let copy = 2; taken.has(slug); copy += 1) slug = `${base}-${copy}.${extension}`;
        taken.add(slug);
        file.slug = slug;
      }
    }
  }

  return { songs };
}

/**
 * The Index song for a song on the song list.
 *
 * A song with a hymn number is looked up by that number in the church's
 * hymnal (`hymnalCollection`) - numbers are what the song list is written in,
 * and titles are spelled more loosely. Songs without one (Psalms, inserts) are
 * matched by title, but only when the title points at exactly one song, so an
 * ambiguous title shows nothing rather than the wrong sheet music.
 */
export function matchIndexSong(
  index: SheetMusicIndex,
  song: { title: string; number: string | null },
  hymnalCollection: string,
): IndexSong | null {
  if (song.number) {
    const byNumber = index.songs.find(
      (candidate) =>
        candidate.collection === hymnalCollection &&
        candidate.hymnNumber !== null &&
        normalizeNumber(candidate.hymnNumber) === normalizeNumber(song.number!),
    );
    if (byNumber) return byNumber;
  }

  const key = songKey(song.title);
  if (key === "") return null;
  const byTitle = index.songs.filter((candidate) => songKey(candidate.title) === key);
  if (byTitle.length === 1) return byTitle[0];

  // Several hymnals print the same hymn; for a numbered song, the church's
  // own hymnal is the one meant.
  if (song.number) {
    const own = byTitle.filter((candidate) => candidate.collection === hymnalCollection);
    if (own.length === 1) return own[0];
  }
  return null;
}

export function findFile(song: IndexSong, slug: string): { version: SongVersion; file: SheetFile } | null {
  for (const version of song.versions) {
    const file = version.files.find((candidate) => candidate.slug === slug);
    if (file) return { version, file };
  }
  return null;
}

/** "Standard", "Capo, Version 2 - Guitar": how a file is named when saved. */
export function fileLabel(version: SongVersion, file: SheetFile): string {
  const name = version.version === "1" ? version.variant : `${version.variant}, Version ${version.version}`;
  return file.instrument ? `${name} - ${file.instrument}` : name;
}

/* ------------------------------------------------------------------------ */
/* What the browser sees                                                    */
/* ------------------------------------------------------------------------ */

export interface PublicSheetFile {
  format: SheetFormat;
  instrument: string | null;
  /** Where to get it, or null when the public may not. */
  href: string | null;
  /**
   * Where a signed-in member gets it, when the public may not - null for a
   * public file (use `href`). The address is only a song slug and a file
   * slug; the file route checks the member's session before serving it.
   */
  membersHref: string | null;
}

export interface PublicVersion {
  variant: string;
  version: string;
  keys: string | null;
  capoFret: string | null;
  files: PublicSheetFile[];
}

/**
 * One song from the Index, safe to send to the browser: no Drive File IDs,
 * no notes, and a link only for the files this visitor may open.
 */
export interface PublicSheetMusic {
  id: string;
  composer: string | null;
  lyricist: string | null;
  keys: string | null;
  type: string | null;
  collection: string | null;
  hymnNumber: string | null;
  category: string | null;
  occasion: string | null;
  /** Left out when it only repeats the collection. */
  source: string | null;
  /** Shown only when it is settled one way or the other. */
  copyright: "not-copyrighted" | "copyrighted" | null;
  versions: PublicVersion[];
  /** True when at least one file is open to the public. */
  available: boolean;
  /** True when at least one file is open to signed-in members only. */
  membersOnly: boolean;
}

export function toPublicSheetMusic(
  song: IndexSong,
  mayOpen: (file: SheetFile) => boolean,
  hrefFor: (file: SheetFile) => string,
  /** Whether a signed-in member may open a file the public may not. */
  membersMayOpen: (file: SheetFile) => boolean = () => false,
): PublicSheetMusic {
  const versions = song.versions
    .filter((version) => version.files.length > 0)
    .map(
      (version): PublicVersion => ({
        variant: version.variant,
        version: version.version,
        keys: version.keys,
        capoFret: version.capoFret,
        files: version.files.map((file) => {
          const open = mayOpen(file);
          return {
            format: file.format,
            instrument: file.instrument,
            href: open ? hrefFor(file) : null,
            membersHref: !open && membersMayOpen(file) ? hrefFor(file) : null,
          };
        }),
      }),
    );

  return {
    id: song.id,
    composer: song.composer,
    lyricist: song.lyricist,
    keys: song.keys,
    type: song.type,
    collection: song.collection,
    hymnNumber: song.hymnNumber,
    category: song.category,
    occasion: song.occasion,
    source: song.source && song.source !== song.collection ? song.source : null,
    copyright:
      song.rights === "cleared" ? "not-copyrighted" : song.rights === "copyrighted" ? "copyrighted" : null,
    versions,
    available: versions.some((version) => version.files.some((file) => file.href !== null)),
    membersOnly: versions.some((version) => version.files.some((file) => file.membersHref !== null)),
  };
}
