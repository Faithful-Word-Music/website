import { describe, expect, it } from "vitest";

import {
  type DriveItem,
  fileLabel,
  findFile,
  formatFromName,
  matchIndexSong,
  parseDrivePath,
  parseIndex,
  rightsFromCell,
  toPublicSheetMusic,
} from "@/lib/sheet-music";
import { canAccessFile, PUBLIC_VIEWER } from "@/lib/sheet-music-access";

const HYMNAL = "Soul-Stirring Songs and Hymns 1989";

/** Mirrors the real Songs headers (checked 2026-09-29), trailing blank columns and all. */
const SONGS_HEADER = [
  "Song ID", "Title", "Composer", "Lyricist", "Key(s)", "Type", "Collection", "Hymn Number",
  "Category", "Occasion", "Source / Organization", "Copyrighted?", "Notes", "", "",
];

function song(id: string, title: string, number: string, collection: string, copyrighted: string, composer = "") {
  return [id, title, composer, "", "C", "Hymnal", collection, number, "", "", collection, copyrighted, "internal note 1SECRETsourceID"];
}

const songs = [
  SONGS_HEADER,
  song("SSSH1989-121", "Like a River Glorious", "121", HYMNAL, "No", "James Mountain"),
  song("SSSH1989-170", "Hallelujah, What a Saviour!", "170", HYMNAL, "No"),
  song("SSSH1989-012", "Blessed Redeemer", "12", HYMNAL, "Yes"),
  song("SSSH1989-125", "The Solid Rock", "125", HYMNAL, "Needs Review"),
  song("SHR-020", "The Solid Rock", "20", "Songs & Hymns of Revival", "No"),
  song("MH-211", "I Wonder as I Wander", "211", "Majesty Hymns", "No"),
  ["PS-054", "Psalm 54", "", "", "Cm", "Psalm", "Psalms", "", "", "", "", "Public Domain", ""],
  ["PS-058", "Psalm 58", "", "", "", "Psalm", "Psalms", "", "", "", "Stedfast Baptist Church", "No", ""],
  ["OS-049", "A Life Remembered", "", "", "", "Other Song", "Other Songs", "", "", "", "Original Composition", "No", ""],
  ["CL-001", "Canon in D", "", "", "D", "Classical", "Classical", "", "", "", "", "No", ""],
  ["SSSH1989-X001", "Hark the Herald & Silent Night (Christmas Caroling)", "", "", "", "Hymnal", HYMNAL, "", "", "", "", "No", ""],
  ["", "Row with no ID", "", "", "", "", "", "", "", "", "", "No", ""],
  ["not an id", "Malformed", "", "", "", "", "", "", "", "", "", "No", ""],
  [],
];

/** A tiny Drive: folders by path, files inside them. */
function drive(files: Array<[path: string, name: string, id: string, modified?: string]>): DriveItem[] {
  const items: DriveItem[] = [
    { id: "top", name: "Faithful Word Music", mimeType: "application/vnd.google-apps.folder" },
    { id: "root", name: "Sheet Music", mimeType: "application/vnd.google-apps.folder", parents: ["top"] },
    { id: "index", name: "Sheet Music Index", mimeType: "application/vnd.google-apps.spreadsheet", parents: ["root"] },
  ];
  const folderIds = new Map<string, string>([["", "root"]]);
  const folderFor = (path: string): string => {
    const known = folderIds.get(path);
    if (known) return known;
    const cut = path.lastIndexOf("/");
    const parent = folderFor(cut === -1 ? "" : path.slice(0, cut));
    const id = `folder:${path}`;
    items.push({ id, name: path.slice(cut + 1), mimeType: "application/vnd.google-apps.folder", parents: [parent] });
    folderIds.set(path, id);
    return id;
  };
  for (const [path, name, id, modified] of files) {
    items.push({ id, name, mimeType: "application/octet-stream", parents: [folderFor(path)], modifiedTime: modified ?? "2026-09-01T00:00:00Z" });
  }
  return items;
}

const SSSH = `01 - Congregational/Hymnals/${HYMNAL}`;

const driveItems = drive([
  [`${SSSH}/Standard/PDF`, "121 - Like a River Glorious.pdf", "1drive-121-std-pdf"],
  [`${SSSH}/Standard/MuseScore`, "121 - Like a River Glorious.mscz", "1drive-121-std-mscz"],
  [`${SSSH}/Chords/Standard/MuseScore`, "121 - Like a River Glorious.mscz", "1drive-121-chords"],
  [`${SSSH}/Chords/Capo/PDF`, "121 - Like a River Glorious.pdf", "1drive-121-capo"],
  [`${SSSH}/Chords/Standard/MuseScore`, "170 - Hallelujah, What a Saviour! (1).mscz", "1drive-170-v1"],
  [`${SSSH}/Chords/Standard/MuseScore`, "170 - Hallelujah, What a Saviour! (2).mscz", "1drive-170-v2"],
  [`${SSSH}/Standard/PDF`, "012 - Blessed Redeemer.pdf", "1drive-012"],
  [`${SSSH}/Standard/PDF`, "125 - The Solid Rock.pdf", "1drive-125"],
  [`${SSSH}/Standard/PDF`, "272 - Jesus, I Come.pdf", "1drive-no-songs-row"],
  ["01 - Congregational/Hymnals/Majesty Hymns/Chords/Capo/PDF", "211 I Wonder as I Wander.pdf", "1drive-mh-211"],
  ["01 - Congregational/Psalms/Standard/PDF", "Psalm 54.pdf", "1drive-ps54"],
  [`${SSSH}/Standard/PDF`, "Hark the Herald & Silent Night (Christmas Caroling).pdf", "1drive-x001"],
  ["01 - Congregational/Psalms/Standard/PDF", "Psalm 58 (Stedfast Baptist Church).pdf", "1drive-ps58"],
  // The same file copied in twice: the newer copy wins.
  ["01 - Congregational/Psalms/Chords/Standard/PDF", "Psalm 58.pdf", "1drive-ps58-old", "2026-01-01T00:00:00Z"],
  ["01 - Congregational/Psalms/Chords/Standard/PDF", "Psalm 58 (Stedfast Baptist Church).pdf", "1drive-ps58-new", "2026-09-29T00:00:00Z"],
  ["01 - Congregational/Other Songs/Chords/Standard/PDF", "A Life Remembered (IN PROGRESS).pdf", "1drive-draft"],
  ["02 - Instrument Parts/Piano/Classical/MuseScore", "Canon in D.mscz", "1drive-canon-piano"],
  ["03 - Ensemble & Classical/Classical/PDF", "Canon in D.pdf", "1drive-canon"],
  ["90 - Reference/Hymnals", `${HYMNAL}.pdf`, "1drive-reference"],
  [`${SSSH}/Standard/PDF`, "121 - notes.txt", "1drive-text"],
  [SSSH, "121 - Like a River Glorious.pdf", "1drive-misplaced"],
]);

// A file outside the Sheet Music folder is never considered.
driveItems.push({ id: "elsewhere", name: "121 - Like a River Glorious.pdf", mimeType: "application/pdf", parents: ["top"] });

const versions = [
  ["Song ID", "Variant", "Version", "Key(s)", "Capo Fret", "Notes"],
  ["SSSH1989-121", "Standard", "(1)", "F", "", "internal note"],
  ["SSSH1989-121", "Capo", "1", "D", "3", ""],
  ["SSSH1989-999", "Standard", "(1)", "G", "", ""],
];

const index = parseIndex({ songs, versions, drive: driveItems });
const byId = (id: string) => index.songs.find((candidate) => candidate.id === id)!;
const files = (id: string) =>
  byId(id).versions.flatMap((version) =>
    version.files.map((file) => `${version.variant} ${version.version} ${file.format} ${file.instrument ?? "-"} ${file.slug} ${file.driveFileId}`),
  );

describe("rightsFromCell", () => {
  it("clears only an explicit No", () => {
    expect(rightsFromCell("No")).toBe("cleared");
    expect(rightsFromCell(" no ")).toBe("cleared");
    expect(rightsFromCell("Yes")).toBe("copyrighted");
    expect(rightsFromCell("Needs Review")).toBe("needs-review");
    expect(rightsFromCell("Public Domain")).toBe("unknown");
    expect(rightsFromCell("")).toBe("unknown");
    expect(rightsFromCell(null)).toBe("unknown");
    expect(rightsFromCell("No?")).toBe("unknown");
  });
});

describe("formatFromName", () => {
  it("goes by the extension alone, never a MIME type", () => {
    expect(formatFromName("Song.MSCZ")).toBe("musescore");
    expect(formatFromName("Song.pdf")).toBe("pdf");
    expect(formatFromName("Song.zip")).toBeNull();
    expect(formatFromName("Song")).toBeNull();
  });
});

describe("parseDrivePath", () => {
  const parse = (path: string, name: string) => parseDrivePath(path.split("/"), name, "id");

  it("reads hymnal, variant, number, title and version", () => {
    expect(parse(`${SSSH}/Chords/Capo/PDF`, "121 - Like a River Glorious.pdf")).toMatchObject({
      collection: HYMNAL, number: "121", title: "Like a River Glorious", variant: "Capo", version: "1", format: "pdf", instrument: "Guitar",
    });
    expect(parse(`${SSSH}/Chords/Standard/MuseScore`, "170 - Hallelujah, What a Saviour! (2).mscz")).toMatchObject({
      number: "170", title: "Hallelujah, What a Saviour!", variant: "Chords", version: "2", format: "musescore", instrument: null,
    });
    expect(parse("01 - Congregational/Hymnals/Bible Truth Hymns/Standard/MuseScore", "1 Come, Thou Almighty King.mscz")).toMatchObject({
      collection: "Bible Truth Hymns", number: "1", title: "Come, Thou Almighty King", variant: "Standard",
    });
  });

  it("reads unnumbered songs and drops notes in brackets", () => {
    expect(parse("01 - Congregational/Psalms/Standard/PDF", "Psalm 19 7-10.pdf")).toMatchObject({
      collection: "Psalms", number: null, title: "Psalm 19 7-10",
    });
    expect(parse("01 - Congregational/Psalms/Standard/PDF", "Psalm 58 (Stedfast Baptist Church).pdf")).toMatchObject({
      title: "Psalm 58", version: "1",
    });
  });

  it("reads instrument parts and the classical folder", () => {
    expect(parse("02 - Instrument Parts/Piano/The Rejoice Hymnal/MuseScore", "Joyful, Joyful, We Adore Thee.mscz")).toMatchObject({
      collection: "The Rejoice Hymnal", instrument: "Piano", variant: "Standard",
    });
    expect(parse("03 - Ensemble & Classical/Classical/PDF", "Canon in D.pdf")).toMatchObject({ collection: "Classical" });
  });

  it("ignores drafts, reference books, other file types and unknown layouts", () => {
    expect(parse("01 - Congregational/Other Songs/Chords/Standard/PDF", "A Life Remembered (IN PROGRESS).pdf")).toBeNull();
    expect(parse("90 - Reference/Hymnals", "The Rejoice Hymnal.pdf")).toBeNull();
    expect(parse(`${SSSH}/Standard/PDF`, "121 - notes.txt")).toBeNull();
    expect(parse("Somewhere Else/PDF", "Song.pdf")).toBeNull();
    expect(parse(SSSH, "121 - Like a River Glorious.pdf")).toBeNull();
  });
});

describe("parseIndex", () => {
  it("keeps only Songs rows with a real Song ID, and never copies notes", () => {
    expect(index.songs.map((candidate) => candidate.id)).toEqual([
      "SSSH1989-121", "SSSH1989-170", "SSSH1989-012", "SSSH1989-125", "SHR-020", "MH-211",
      "PS-054", "PS-058", "OS-049", "CL-001", "SSSH1989-X001",
    ]);
    expect(byId("SSSH1989-121")).toMatchObject({ composer: "James Mountain", lyricist: null, hymnNumber: "121", rights: "cleared" });
    expect(JSON.stringify(index)).not.toMatch(/SECRET|internal note/);
  });

  it("finds each song's files from the folders, Standard first and PDF first", () => {
    expect(files("SSSH1989-121")).toEqual([
      "Standard 1 pdf - standard-1.pdf 1drive-121-std-pdf",
      "Standard 1 musescore - standard-1.mscz 1drive-121-std-mscz",
      "Chords 1 musescore - chords-1.mscz 1drive-121-chords",
      "Capo 1 pdf Guitar capo-1-guitar.pdf 1drive-121-capo",
    ]);
    expect(files("SSSH1989-170")).toEqual([
      "Chords 1 musescore - chords-1.mscz 1drive-170-v1",
      "Chords 2 musescore - chords-2.mscz 1drive-170-v2",
    ]);
  });

  it("matches by number within the file's own collection, not the church hymnal", () => {
    expect(files("MH-211")).toEqual(["Capo 1 pdf Guitar capo-1-guitar.pdf 1drive-mh-211"]);
    expect(files("SSSH1989-012")).toEqual(["Standard 1 pdf - standard-1.pdf 1drive-012"]);
    expect(files("SHR-020")).toEqual([]);
  });

  it("matches unnumbered songs by title, and keeps the newest of two copies", () => {
    expect(files("PS-054")).toEqual(["Standard 1 pdf - standard-1.pdf 1drive-ps54"]);
    // Bracketed notes in the Songs title are ignored too.
    expect(files("SSSH1989-X001")).toEqual(["Standard 1 pdf - standard-1.pdf 1drive-x001"]);
    expect(files("PS-058")).toEqual([
      "Standard 1 pdf - standard-1.pdf 1drive-ps58",
      "Chords 1 pdf - chords-1.pdf 1drive-ps58-new",
    ]);
  });

  it("reads instrument parts and the classical folder into their songs", () => {
    expect(files("CL-001")).toEqual([
      "Standard 1 pdf - standard-1.pdf 1drive-canon",
      "Standard 1 musescore Piano standard-1-piano.mscz 1drive-canon-piano",
    ]);
  });

  it("leaves out drafts, reference books, misplaced files and files outside Sheet Music", () => {
    const all = JSON.stringify(index);
    for (const id of ["1drive-draft", "1drive-reference", "1drive-text", "1drive-misplaced", "elsewhere", "1drive-no-songs-row"]) {
      expect(all).not.toContain(id);
    }
    expect(byId("OS-049").versions).toEqual([]);
  });

  it("takes a key or capo from the Versions tab, under either column name", () => {
    const [standard, , capo] = byId("SSSH1989-121").versions;
    expect(standard).toMatchObject({ keys: "F", capoFret: null });
    expect(capo).toMatchObject({ keys: "D", capoFret: "3" });

    const older = parseIndex({
      songs,
      versions: [["Song ID", "Variant", "Edition", "Key(s)", "Capo Fret"], ["SSSH1989-121", "Standard", "(1)", "Eb", ""]],
      drive: driveItems,
    });
    expect(older.songs[0].versions[0].keys).toBe("Eb");
    expect(parseIndex({ songs, versions: [], drive: driveItems }).songs[0].versions[0].keys).toBeNull();
  });

  it("returns nothing for a Songs tab without its header", () => {
    expect(parseIndex({ songs: [["x", "y"]], versions: [], drive: driveItems }).songs).toEqual([]);
  });
});

describe("findFile and fileLabel", () => {
  it("names downloads by variant and version", () => {
    const hallelujah = byId("SSSH1989-170");
    const second = findFile(hallelujah, "chords-2.mscz")!;
    expect(second.file.driveFileId).toBe("1drive-170-v2");
    expect(fileLabel(second.version, second.file)).toBe("Chords, Version 2");

    const capo = findFile(byId("SSSH1989-121"), "capo-1-guitar.pdf")!;
    expect(fileLabel(capo.version, capo.file)).toBe("Capo - Guitar");
    expect(findFile(hallelujah, "nope.pdf")).toBeNull();
  });
});

describe("matchIndexSong", () => {
  it("matches a numbered song by its number in the church's hymnal", () => {
    expect(matchIndexSong(index, { title: "Like a River Glorious", number: "121" }, HYMNAL)?.id).toBe("SSSH1989-121");
    expect(matchIndexSong(index, { title: "Blessed Redeemer", number: "012" }, HYMNAL)?.id).toBe("SSSH1989-012");
  });

  it("matches an unnumbered song by a title only one song has", () => {
    expect(matchIndexSong(index, { title: "Psalm 54", number: null }, HYMNAL)?.id).toBe("PS-054");
  });

  it("refuses an ambiguous title rather than guess", () => {
    expect(matchIndexSong(index, { title: "The Solid Rock", number: null }, HYMNAL)).toBeNull();
    expect(matchIndexSong(index, { title: "Unknown Song", number: null }, HYMNAL)).toBeNull();
  });

  it("prefers the church's hymnal when a numbered title appears in several", () => {
    expect(matchIndexSong(index, { title: "The Solid Rock", number: "999" }, HYMNAL)?.id).toBe("SSSH1989-125");
  });
});

describe("access and the public view", () => {
  const view = (id: string) => {
    const indexSong = byId(id);
    return toPublicSheetMusic(
      indexSong,
      (file) => canAccessFile(indexSong, file, PUBLIC_VIEWER),
      (file) => `/library/songs/x/sheet-music/${file.slug}`,
    );
  };

  it("links the files of a song marked not copyrighted", () => {
    const music = view("SSSH1989-121");
    expect(music.available).toBe(true);
    expect(music.copyright).toBe("not-copyrighted");
    expect(music.versions[0]).toMatchObject({ variant: "Standard", version: "1", keys: "F" });
    expect(music.versions[0].files[0].href).toBe("/library/songs/x/sheet-music/standard-1.pdf");
  });

  it("links nothing for Yes, Needs Review or anything else", () => {
    for (const id of ["SSSH1989-012", "SSSH1989-125", "PS-054"]) {
      const music = view(id);
      expect(music.available).toBe(false);
      expect(music.versions.flatMap((version) => version.files).every((file) => file.href === null)).toBe(true);
    }
    expect(view("SSSH1989-125").copyright).toBeNull();
    expect(view("SSSH1989-012").copyright).toBe("copyrighted");
  });

  it("never carries a Drive File ID or a note to the browser", () => {
    const json = JSON.stringify(index.songs.map((candidate) => view(candidate.id)));
    expect(json).not.toMatch(/1drive-|driveFileId|SECRET|internal note/);
  });

  it("canAccessFile follows the song's rights", () => {
    const river = byId("SSSH1989-121");
    const blessed = byId("SSSH1989-012");
    expect(canAccessFile(river, river.versions[0].files[0], PUBLIC_VIEWER)).toBe(true);
    expect(canAccessFile(blessed, blessed.versions[0].files[0], PUBLIC_VIEWER)).toBe(false);
  });
});
