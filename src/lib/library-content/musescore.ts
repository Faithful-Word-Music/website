import { strFromU8, unzipSync } from "fflate";
import { SaxesParser } from "saxes";

/**
 * Reading the LYRICS out of a MuseScore file. Nothing else: no notes, no
 * rhythm, no harmony - Phase 3 of the AI system is about what a song says
 * (AI.md). Pure functions; the file itself is fetched in indexer.ts.
 *
 * A .mscz is a zip holding one .mscx (the score, as XML) at its root, beside
 * a thumbnail and settings this never opens. In the score, in MuseScore 3 and
 * 4 alike, each sung note carries:
 *
 *   <Lyrics>
 *     <no>1</no>                    the lyric line, from 0; left out for the first
 *     <syllabic>begin</syllabic>    begin / middle: the word goes on in the next
 *     <text>Je</text>               syllable; end, or left out: the word ends here
 *   </Lyrics>
 *
 * inside <Chord>, inside <voice>, inside <Measure>, inside the <Staff> that
 * holds the music (a child of <Score>; the <Staff> elements under <Part> only
 * describe the staves). What those lines MEAN - verses, a refrain - is worked
 * out in lyrics.ts from where in the score each line has words.
 *
 * Read in one streaming pass that looks at a handful of elements; a score is
 * never built into a tree.
 */

/** One syllable under one note. */
export interface LyricSyllable {
  /** The staff's id, "1" for the top one. */
  staff: string;
  /** The voice within the staff, from 0. */
  voice: number;
  /** The lyric line, from 0: verse 1 is line 0. */
  line: number;
  /** The measure it is in, counted from 0 along its staff. */
  measure: number;
  text: string;
  /** True when the word goes on in the next syllable of its line. */
  joins: boolean;
}

/** Words written above the music: "REFRAIN", "CHORUS". */
export interface ScoreMarker {
  measure: number;
  text: string;
}

export interface ScoreLyrics {
  /** The file format's version, "3.02" or "4.50"; null when the score does not say. */
  version: string | null;
  /** In the order they are written: staff by staff, measure by measure. */
  syllables: LyricSyllable[];
  markers: ScoreMarker[];
}

/** No score of this library comes near this; anything larger is not read. */
export const MAX_MSCZ_BYTES = 8 * 1024 * 1024;
const MAX_MSCX_BYTES = 64 * 1024 * 1024;

/**
 * The score's XML from a .mscz file's bytes. Only the .mscx is decompressed -
 * the one at the root when there are several (a file with parts keeps theirs
 * in folders). Throws when the file is not a MuseScore archive.
 */
export function readMscz(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_MSCZ_BYTES) throw new Error("The MuseScore file is too large to read.");

  let names: string[] = [];
  const wanted = (name: string, size: number) => name.toLowerCase().endsWith(".mscx") && size <= MAX_MSCX_BYTES;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        return wanted(file.name, file.originalSize) && !file.name.includes("/");
      },
    });
    // A score saved with its .mscx in a folder: read again, taking the shallowest.
    if (Object.keys(files).length === 0) {
      const nested = names.filter((name) => name.toLowerCase().endsWith(".mscx")).sort((a, b) => a.split("/").length - b.split("/").length)[0];
      names = [];
      files = nested ? unzipSync(bytes, { filter: (file) => file.name === nested && wanted(file.name, file.originalSize) }) : {};
    }
  } catch {
    throw new Error("The file is not a MuseScore (.mscz) archive.");
  }

  const score = Object.values(files)[0];
  if (!score) throw new Error("The MuseScore file holds no score (.mscx).");
  return strFromU8(score);
}

/** Text written above the staff that can name a section. */
const MARKER_ELEMENTS = new Set(["StaffText", "SystemText", "RehearsalMark"]);

/** Symbols MuseScore writes inside lyric text by name; the only one that matters joins two words under a note. */
const SYMBOL_TEXT: Record<string, string> = { lyricsElision: " ", lyricsElisionNarrow: " ", lyricsElisionWide: " " };

/**
 * Every lyric syllable in a score's XML, with where it sits. Throws when the
 * XML cannot be read at all; a score without lyrics is an empty list.
 */
export function extractLyrics(mscx: string): ScoreLyrics {
  const parser = new SaxesParser();
  const path: string[] = [];
  const syllables: LyricSyllable[] = [];
  const markers: ScoreMarker[] = [];
  let version: string | null = null;

  // Where the pass is: the music staff, its measure and voice.
  let staff: string | null = null;
  let staffDepth = -1;
  let measure = -1;
  let voice = -1;

  // The <Lyrics> or marker being read, and the element whose text is wanted.
  let lyric: { line: number; syllabic: string; text: string; depth: number } | null = null;
  let marker: { text: string; depth: number } | null = null;
  let capture: "no" | "syllabic" | "text" | null = null;
  let captureDepth = -1;
  let buffer = "";

  parser.on("error", (error) => {
    throw new Error(`The score could not be read (${error.message.split("\n")[0].slice(0, 120)}).`);
  });

  parser.on("opentag", (tag) => {
    const { name } = tag;
    const depth = path.length;

    if (name === "museScore" && depth === 0) {
      const value = tag.attributes.version;
      version = typeof value === "string" && value !== "" ? value : null;
    } else if (name === "Staff" && depth === 2 && path[1] === "Score" && staff === null) {
      const id = tag.attributes.id;
      staff = typeof id === "string" && id !== "" ? id : String(depth);
      staffDepth = depth;
      measure = -1;
    } else if (staff !== null) {
      if (name === "Measure") {
        measure += 1;
        voice = -1;
      } else if (name === "voice") {
        voice += 1;
      } else if (name === "Lyrics" && !lyric) {
        lyric = { line: 0, syllabic: "", text: "", depth };
      } else if (MARKER_ELEMENTS.has(name) && !lyric && !marker) {
        marker = { text: "", depth };
      } else if (lyric && capture === null && depth === lyric.depth + 1 && (name === "no" || name === "syllabic" || name === "text")) {
        capture = name;
        captureDepth = depth;
        buffer = "";
      } else if (marker && capture === null && depth === marker.depth + 1 && name === "text") {
        capture = "text";
        captureDepth = depth;
        buffer = "";
      }
    }

    if (!tag.isSelfClosing) path.push(name);
  });

  parser.on("text", (text) => {
    if (capture === null) return;
    // Formatting inside lyric text (<i>, <b>, <font>) keeps its words; a <sym> is a symbol's name.
    const inside = path[path.length - 1];
    buffer += inside === "sym" ? (SYMBOL_TEXT[text.trim()] ?? "") : text;
  });

  parser.on("closetag", (tag) => {
    if (tag.isSelfClosing) return;
    path.pop();
    const depth = path.length;

    if (capture !== null && depth === captureDepth) {
      if (lyric) {
        if (capture === "no") lyric.line = Math.max(0, Math.round(Number(buffer)) || 0);
        else if (capture === "syllabic") lyric.syllabic = buffer.trim();
        else lyric.text += buffer;
      } else if (marker) {
        marker.text += buffer;
      }
      capture = null;
    } else if (lyric && depth === lyric.depth) {
      const text = lyric.text.replace(/[ \s]+/g, " ").trim();
      if (text !== "" && staff !== null) {
        syllables.push({
          staff,
          voice: Math.max(0, voice),
          line: lyric.line,
          measure: Math.max(0, measure),
          text,
          joins: lyric.syllabic === "begin" || lyric.syllabic === "middle",
        });
      }
      lyric = null;
    } else if (marker && depth === marker.depth) {
      const text = marker.text.replace(/[ \s]+/g, " ").trim();
      if (text !== "") markers.push({ measure: Math.max(0, measure), text });
      marker = null;
    } else if (staff !== null && depth === staffDepth) {
      staff = null;
    }
  });

  parser.write(mscx).close();
  return { version, syllables, markers };
}
