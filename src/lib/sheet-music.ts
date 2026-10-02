import { songKey } from "@/lib/song-list";

/**
 * Sheet music: the songs in the Sheet Music Index, with the files found in
 * the Drive folders. Pure functions only - the fetching lives in
 * src/lib/sheet-music-index.ts.
 *
 * ---------------------------------------------------------------------------
 * WHERE EACH PIECE COMES FROM
 * ---------------------------------------------------------------------------
 *   The Drive folders   the files. Nothing about their layout is assumed:
 *                       what a file is comes only from the sheet music
 *                       types' source folders (Admin -> Configuration).
 *   Songs tab           one row per song: details, and "Copyrighted?", which
 *                       decides whether its files may be shared.
 *   Versions tab        optional: a key or capo fret for one version of one
 *                       type. Called "Editions" in older copies.
 *
 * Reading happens in two steps:
 *
 *   readSheetMusic()  (cached)  every file, joined to its song, with its
 *                               folder path - not yet sorted into types.
 *   classify()  (per request)   each file given to the type whose source
 *                               folder holds it; files no source holds
 *                               are left out.
 *
 * A file's song: the hymn number and title come from its name, and the
 * collection from the nearest folder above it named like a Collection on
 * the Songs tab - wherever that folder sits.
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
  /** Unique within its song, e.g. "standard-1.pdf" or "clarinet-bb-2.mscz". */
  slug: string;
  /** SERVER ONLY. Never include in anything sent to the browser. */
  driveFileId: string;
  /** When the file last changed in Drive (ISO), for "New sheet music" on the Dashboard. */
  modifiedTime?: string;
}

/** One version of a song's sheet music of one type. */
export interface SongVersion {
  typeId: number;
  /** The type's name: "Standard", "Capo (Chords)", "Clarinet (Bb)". */
  label: string;
  /** "1", "2"... - from " (2)" at the end of a file name. */
  version: string;
  keys: string | null;
  capoFret: string | null;
  /** PDF first, then MuseScore. */
  files: SheetFile[];
}

/** A song's row on the Songs tab. */
export interface SongDetails {
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
}

export interface IndexSong extends SongDetails {
  /** In the order of the types, then by version. */
  versions: SongVersion[];
}

/** The Index with every file sorted into its type. */
export interface SheetMusicIndex {
  songs: IndexSong[];
  /** The types, in their configured order. */
  types: Array<{ id: number; label: string }>;
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

/** In a source, splits "inside this folder" from "every folder named this": see splitSource. */
export const ANYWHERE = "**";

/** Folders that only split a source's files by format; a source always takes both. */
export const FORMAT_FOLDERS = new Set(["pdf", "musescore"]);

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
/* Reading a file's name                                                    */
/* ------------------------------------------------------------------------ */

/** A sheet music file in Drive, joined to nothing yet. */
export interface DriveFile {
  /** The folder names between "Sheet Music" and the file. */
  folders: string[];
  /** Hymn number as written, e.g. "014"; null for songs without one. */
  number: string | null;
  title: string;
  version: string;
  format: SheetFormat;
  driveFileId: string;
  modifiedTime: string;
}

/** "(2)", "(Stedfast Baptist Church)", "(Christmas Caroling)" and the space before. */
const BRACKETED = /\s*\(([^()]*)\)/g;

/** A title as matched: case, punctuation and bracketed notes don't count. */
function titleKey(title: string): string {
  return songKey(title.replace(BRACKETED, ""));
}

/**
 * What a file is, from its name: number, title, version and format. null
 * for anything the website should not use - other file types and drafts.
 */
export function parseDrivePath(
  folders: string[],
  name: string,
  driveFileId: string,
  modifiedTime = "",
): DriveFile | null {
  const format = formatFromName(name);
  if (!format || /in progress/i.test(name)) return null;

  let base = name.replace(/\.[^.]+$/, "");
  let version = "1";
  base = base.replace(BRACKETED, (_, note: string) => {
    if (/^\s*\d+\s*$/.test(note)) version = String(Number(note));
    return "";
  });

  const numbered = base.match(/^(\d+)(?:\s*-\s*|\s+)(.+)$/);
  const title = (numbered ? numbered[2] : base).trim();
  if (!title) return null;

  return { folders, number: numbered ? numbered[1] : null, title, version, format, driveFileId, modifiedTime };
}

/** The folder names between "Sheet Music" and the item, or null when it is not inside it. */
function foldersAbove(item: DriveItem, byId: Map<string, DriveItem>): string[] | null {
  const folders: string[] = [];
  let parent = item.parents?.[0] ? byId.get(item.parents[0]) : undefined;
  for (let depth = 0; parent && depth < 20; depth += 1) {
    if (parent.name === ROOT_FOLDER) return folders;
    folders.unshift(parent.name);
    parent = parent.parents?.[0] ? byId.get(parent.parents[0]) : undefined;
  }
  return null;
}

/** Every usable file inside the "Sheet Music" folder, with its folder path. */
export function sheetsFromDrive(items: DriveItem[]): DriveFile[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const sheets: DriveFile[] = [];
  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) continue;
    const folders = foldersAbove(item, byId);
    if (!folders) continue;
    const sheet = parseDrivePath(folders, item.name, item.id, item.modifiedTime);
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}

/* ------------------------------------------------------------------------ */
/* Source folders                                                           */
/* ------------------------------------------------------------------------ */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A source, as stored: folder names below "Sheet Music". Either
 *   ["03 - Ensemble & Classical"]                       everything in this folder, or
 *   ["01 - Congregational", ANYWHERE, "Chords", "Capo"]  every "Chords › Capo" folder
 *                                                        anywhere inside 01 - Congregational.
 */
export function splitSource(source: readonly string[]): { inside: string[]; every: string[] | null } {
  const at = source.indexOf(ANYWHERE);
  return at === -1
    ? { inside: [...source], every: null }
    : { inside: source.slice(0, at), every: source.slice(at + 1) };
}

const startsWith = (path: readonly string[], prefix: readonly string[], at = 0) =>
  prefix.length + at <= path.length && prefix.every((segment, index) => same(segment, path[at + index]));

/**
 * How closely a source holds a path - the number of folder names it
 * matches, so the more specific source wins - or 0 when it does not hold it
 * at all. Everything deeper than the matched folder is inside it.
 */
export function sourceMatch(path: readonly string[], source: readonly string[]): number {
  const { inside, every } = splitSource(source);
  if (!startsWith(path, inside)) return 0;
  if (!every) return inside.length;
  if (every.length === 0) return 0;
  for (let at = inside.length; at + every.length <= path.length; at += 1) {
    if (startsWith(path, every, at)) return inside.length + every.length;
  }
  return 0;
}

/** A folder in "Sheet Music", for browsing to a source. */
export interface DriveFolder {
  /** Folder names below "Sheet Music", ending with this one. */
  path: string[];
  /** Sheet music files anywhere inside it. */
  files: number;
  /** Named like a Collection on the Songs tab. */
  collection: boolean;
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

/** A key or capo fret from the Versions tab, for one version of one type. */
export interface VersionNote {
  songId: string;
  /** As written: a type's name ("Capo (Chords)") or an older name ("Capo"). */
  variant: string;
  version: string;
  keys: string | null;
  capoFret: string | null;
}

/** Everything read from Google, before any file is sorted into a type. Cached. */
export interface SheetMusicSources {
  songs: Array<SongDetails & { files: DriveFile[] }>;
  notes: VersionNote[];
  folders: DriveFolder[];
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

function parseSongs(grid: string[][]): SongDetails[] {
  const songs = new Map<string, SongDetails>();

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
    });
  }

  return [...songs.values()];
}

/** Whether a folder name is a Collection on the Songs tab. */
export function collectionNames(sources: Pick<SheetMusicSources, "songs">): (name: string) => boolean {
  const names = new Set(sources.songs.flatMap((song) => (song.collection ? [song.collection.toLowerCase()] : [])));
  return (name) => names.has(name.toLowerCase());
}

/**
 * The Songs tab, with each song's files from Drive, and the Versions tab -
 * before anything is sorted into types.
 *
 * A file joins its song by collection + hymn number, or by collection +
 * title when exactly one song there has that title. Its collection is the
 * nearest folder above it named like a Collection on the Songs tab; a file
 * under no such folder is matched by title alone, again only when exactly
 * one song has it. A file that matches no song is left out: with no Songs
 * row there is no rights decision, so it could never be shared anyway.
 */
export function readSheetMusic(sources: IndexSources): SheetMusicSources {
  const songs = parseSongs(sources.songs).map((song) => ({ ...song, files: [] as DriveFile[] }));
  const isCollection = collectionNames({ songs });

  const byNumber = new Map<string, (typeof songs)[number]>();
  const byTitle = new Map<string, Array<(typeof songs)[number]>>();
  const add = (key: string, song: (typeof songs)[number]) => byTitle.set(key, [...(byTitle.get(key) ?? []), song]);
  for (const song of songs) {
    const collection = song.collection?.toLowerCase() ?? "";
    if (song.hymnNumber) byNumber.set(`${collection}|${normalizeNumber(song.hymnNumber)}`, song);
    add(`${collection}|${titleKey(song.title)}`, song);
    add(`*|${titleKey(song.title)}`, song);
  }

  const sheets = sheetsFromDrive(sources.drive);
  for (const sheet of sheets) {
    const collection = sheet.folders.findLast(isCollection)?.toLowerCase();
    let song = collection && sheet.number ? byNumber.get(`${collection}|${normalizeNumber(sheet.number)}`) : undefined;
    if (!song) {
      const titled = byTitle.get(`${collection ?? "*"}|${titleKey(sheet.title)}`) ?? [];
      if (titled.length === 1) song = titled[0];
    }
    song?.files.push(sheet);
  }

  const notes: VersionNote[] = [];
  for (const row of readTable(sources.versions, [["song id"], ["variant"], ["version", "edition"]])) {
    const number = row["version"] ?? row["edition"];
    if (!row["song id"] || !row["variant"] || !number) continue;
    notes.push({
      songId: row["song id"],
      variant: row["variant"],
      version: versionNumber(number),
      keys: row["key(s)"],
      capoFret: row["capo fret"],
    });
  }

  return { songs, notes, folders: driveFolders(sources.drive, sheets, isCollection) };
}

/** Every folder in "Sheet Music", with how many sheet music files are inside it. */
function driveFolders(items: DriveItem[], sheets: DriveFile[], isCollection: (name: string) => boolean): DriveFolder[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const counts = new Map<string, number>();
  const key = (path: readonly string[]) => path.join("/").toLowerCase();
  for (const sheet of sheets) {
    for (let depth = 1; depth <= sheet.folders.length; depth += 1) {
      const prefix = key(sheet.folders.slice(0, depth));
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  const folders: DriveFolder[] = [];
  for (const item of items) {
    if (item.mimeType !== FOLDER_MIME) continue;
    const above = foldersAbove(item, byId);
    if (!above) continue;
    const path = [...above, item.name];
    folders.push({ path, files: counts.get(key(path)) ?? 0, collection: isCollection(item.name) });
  }
  return folders.sort((a, b) => key(a.path).localeCompare(key(b.path)));
}

/** A sheet music type as classify() needs it. */
export interface TypeSources {
  id: number;
  label: string;
  /** An older name the Versions tab may use ("Capo"); see sheet-music-type.ts. */
  legacyVariant?: string | null;
  /** Each source, as splitSource() reads it. */
  sources: string[][];
}

/**
 * The type a file belongs to: the one whose source holds it most closely
 * (see sourceMatch), the type higher in the list on a tie, or null when no
 * source holds it.
 */
export function typeForFile(folders: readonly string[], types: readonly TypeSources[]): TypeSources | null {
  let best: { type: TypeSources; score: number } | null = null;
  for (const type of types) {
    for (const source of type.sources) {
      const score = sourceMatch(folders, source);
      if (score > 0 && (!best || score > best.score)) best = { type, score };
    }
  }
  return best?.type ?? null;
}

/**
 * Every song's files sorted into the types, in the types' order. Files no
 * source holds are left out. One file per type + version + format: when a
 * file has been copied in twice, the most recently changed copy wins.
 */
export function classify(sources: SheetMusicSources, types: readonly TypeSources[]): SheetMusicIndex {
  const order = new Map(types.map((type, index) => [type.id, index]));

  const songs = sources.songs.map(({ files, ...details }): IndexSong => {
    const chosen = new Map<string, { type: TypeSources; file: DriveFile }>();
    for (const file of files) {
      const type = typeForFile(file.folders, types);
      if (!type) continue;
      const key = `${type.id}|${file.version}|${file.format}`;
      const current = chosen.get(key);
      if (!current || file.modifiedTime > current.file.modifiedTime) chosen.set(key, { type, file });
    }

    const versions: SongVersion[] = [];
    for (const { type, file } of chosen.values()) {
      let version = versions.find((candidate) => candidate.typeId === type.id && candidate.version === file.version);
      if (!version) {
        const note = sources.notes.find(
          (candidate) =>
            candidate.songId === details.id &&
            candidate.version === file.version &&
            (same(candidate.variant, type.label) || (!!type.legacyVariant && same(candidate.variant, type.legacyVariant))),
        );
        version = {
          typeId: type.id,
          label: type.label,
          version: file.version,
          keys: note?.keys ?? null,
          capoFret: note?.capoFret ?? null,
          files: [],
        };
        versions.push(version);
      }
      version.files.push({
        format: file.format,
        slug: "",
        driveFileId: file.driveFileId,
        modifiedTime: file.modifiedTime || undefined,
      });
    }

    versions.sort(
      (a, b) =>
        (order.get(a.typeId) ?? 0) - (order.get(b.typeId) ?? 0) ||
        a.version.localeCompare(b.version, undefined, { numeric: true }),
    );
    const taken = new Set<string>();
    for (const version of versions) {
      version.files.sort((a, b) => (a.format === b.format ? 0 : a.format === "pdf" ? -1 : 1));
      for (const file of version.files) {
        const base = `${slugPart(version.label) || "type"}-${version.version}`;
        const extension = FILE_EXTENSIONS[file.format];
        let slug = `${base}.${extension}`;
        for (let copy = 2; taken.has(slug); copy += 1) slug = `${base}-${copy}.${extension}`;
        taken.add(slug);
        file.slug = slug;
      }
    }
    return { ...details, versions };
  });

  return { songs, types: types.map(({ id, label }) => ({ id, label })) };
}

/**
 * The folders an "every <name> folder" source stands for whose files really
 * go to its type - leaving out any a more specific source of another type
 * claims (every "Standard" folder includes Chords › Standard, which belongs
 * to Standard (Chords)). For turning such a source into plain folders.
 */
export function foldersOwned(sources: SheetMusicSources, types: readonly TypeSources[], source: readonly string[]): string[][] {
  return sourceCoverage(sources, source).folders.filter((folder) => {
    const own = sourceMatch(folder, source);
    return !types.some((type) =>
      type.sources.some((other) => other !== source && sourceMatch(folder, other) > own),
    );
  });
}

/**
 * What a source covers right now: the folders it stands for, and how many
 * songs have a file inside them. For the source picker's preview.
 */
export function sourceCoverage(sources: SheetMusicSources, source: readonly string[]): { folders: string[][]; songs: number } {
  const { inside, every } = splitSource(source);
  const folders = sources.folders
    .filter((folder) =>
      every
        ? every.length > 0 &&
          folder.path.length >= inside.length + every.length &&
          startsWith(folder.path, inside) &&
          startsWith(folder.path, every, folder.path.length - every.length)
        : folder.path.length === inside.length && startsWith(folder.path, inside),
    )
    .map((folder) => folder.path);
  const songs = sources.songs.filter((song) => song.files.some((file) => sourceMatch(file.folders, source) > 0));
  return { folders, songs: songs.length };
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

/** "Standard", "Clarinet (Bb), Version 2": how a file is named when saved. */
export function fileLabel(version: SongVersion): string {
  return version.version === "1" ? version.label : `${version.label}, Version ${version.version}`;
}

/* ------------------------------------------------------------------------ */
/* What the browser sees                                                    */
/* ------------------------------------------------------------------------ */

export interface PublicSheetFile {
  format: SheetFormat;
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
  /** The type's name. */
  label: string;
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
        label: version.label,
        version: version.version,
        keys: version.keys,
        capoFret: version.capoFret,
        files: version.files.map((file) => {
          const open = mayOpen(file);
          return {
            format: file.format,
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
