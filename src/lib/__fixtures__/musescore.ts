/**
 * Small MuseScore scores for the tests, written the way the real files are
 * (checked against the library: MuseScore 3.6 and 4.x). Only what the lyric
 * reader looks at is here - a score's notes are beside the point.
 */

/** One syllable under a note: its text, how it joins ("begin", "middle", "end" or "" for a whole word), its line. */
export type Syllable = [text: string, syllabic?: "begin" | "middle" | "end" | "", line?: number];

/** A note with the syllables under it, or a marker written above the staff ("REFRAIN"). */
export type Note = Syllable[] | { marker: string };

/** A measure: its voices, each a list of notes. */
export type Measure = Note[][];

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function note(content: Note, version: 3 | 4): string {
  if (!Array.isArray(content)) return `<StaffText><style>Staff</style><text>${escape(content.marker)}</text></StaffText>`;
  const lyrics = content
    .map(([text, syllabic = "", line = 0]) =>
      [
        "<Lyrics>",
        line > 0 ? `<no>${line}</no>` : "",
        version === 4 ? "<eid>abc_def</eid>" : "",
        syllabic ? `<syllabic>${syllabic}</syllabic>` : "",
        version === 4 ? "<ticks_f>1/4</ticks_f>" : "",
        `<text>${text.includes("<") ? text : escape(text)}</text>`,
        "</Lyrics>",
      ].join(""),
    )
    .join("");
  return `<Chord><durationType>quarter</durationType>${lyrics}<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>`;
}

/** A score's XML from its staves, each a list of measures. */
export function mscx(staves: Measure[][], version: 3 | 4 = 4): string {
  const staffXml = staves
    .map(
      (measures, index) =>
        `<Staff id="${index + 1}">${index === 0 ? "<VBox><Text><style>title</style><text>A Title</text></Text></VBox>" : ""}${measures
          .map((voices) => `<Measure>${voices.map((notes) => `<voice>${notes.map((item) => note(item, version)).join("")}</voice>`).join("")}</Measure>`)
          .join("")}</Staff>`,
    )
    .join("");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<museScore version="${version === 4 ? "4.50" : "3.02"}">`,
    `<programVersion>${version === 4 ? "4.5.2" : "3.6.2"}</programVersion>`,
    `<Score>`,
    `<metaTag name="workTitle">A Title</metaTag>`,
    // The staves' descriptions, which are not the music.
    `<Part>${staves.map((_, index) => `<Staff id="${index + 1}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`).join("")}<trackName>Voice</trackName></Part>`,
    staffXml,
    `</Score>`,
    `</museScore>`,
  ].join("\n");
}

/** A line of words as one measure per word, one voice: "1. How firm" on the given lyric line. */
export const words = (text: string, line = 0): Measure[] => text.split(" ").map((word) => [[[[word, "", line]]]]);

/**
 * Verses under the same notes, as a hymn is written: each verse a lyric line,
 * word by word, one measure a word. Shorter verses simply stop.
 */
export function verses(...lines: string[]): Measure[] {
  const split = lines.map((line) => line.split(" "));
  const length = Math.max(...split.map((line) => line.length));
  return Array.from({ length }, (_, at) => [
    [split.flatMap((line, index): Syllable[] => (line[at] === undefined ? [] : [[line[at], "", index]]))],
  ]);
}
