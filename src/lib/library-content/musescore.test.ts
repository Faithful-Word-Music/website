import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { mscx, verses } from "@/lib/__fixtures__/musescore";

import { extractLyrics, readMscz } from "./musescore";

describe("readMscz", () => {
  const score = mscx([verses("1. Amazing grace")]);

  it("reads the score at the archive's root, whatever else is in it", () => {
    const archive = zipSync({
      "META-INF/container.xml": strToU8("<container/>"),
      "Thumbnails/thumbnail.png": new Uint8Array([137, 80, 78, 71]),
      "Excerpts/Part/Part.mscx": strToU8("<museScore/>"),
      "107 Amazing Grace.mscx": strToU8(score),
      "audiosettings.json": strToU8("{}"),
    });
    expect(readMscz(archive)).toBe(score);
  });

  it("falls back to a score kept in a folder", () => {
    expect(readMscz(zipSync({ "scores/deep/part.mscx": strToU8("<x/>"), "scores/song.mscx": strToU8(score) }))).toBe(score);
  });

  it("refuses what is not a MuseScore archive", () => {
    expect(() => readMscz(strToU8("<html>Not found</html>"))).toThrow("not a MuseScore");
    expect(() => readMscz(zipSync({ "notes.txt": strToU8("hello") }))).toThrow("no score");
  });
});

describe("extractLyrics", () => {
  it("reads each syllable with its line, measure and how it joins - in MuseScore 3 and 4 alike", () => {
    for (const version of [3, 4] as const) {
      const score = extractLyrics(
        mscx(
          [
            [
              [[[["1. A", "begin"], ["2. Through", "", 1]], [["maz", "middle"]]]],
              [[[["ing", "end"]], [["grace", ""], ["dangers", "", 1]]]],
            ],
          ],
          version,
        ),
      );
      expect(score.version).toBe(version === 4 ? "4.50" : "3.02");
      expect(score.syllables).toEqual([
        { staff: "1", voice: 0, line: 0, measure: 0, text: "1. A", joins: true },
        { staff: "1", voice: 0, line: 1, measure: 0, text: "2. Through", joins: false },
        { staff: "1", voice: 0, line: 0, measure: 0, text: "maz", joins: true },
        { staff: "1", voice: 0, line: 0, measure: 1, text: "ing", joins: false },
        { staff: "1", voice: 0, line: 0, measure: 1, text: "grace", joins: false },
        { staff: "1", voice: 0, line: 1, measure: 1, text: "dangers", joins: false },
      ]);
    }
  });

  it("tells voices and staves apart", () => {
    const score = extractLyrics(
      mscx([
        [[[[["He", ""]]], [[["a-rose", ""]]]]],
        [[[[["rose", ""]]]]],
      ]),
    );
    expect(score.syllables.map(({ staff, voice, text }) => `${staff}/${voice} ${text}`)).toEqual(["1/0 He", "1/1 a-rose", "2/0 rose"]);
  });

  it("keeps the words of formatted lyric text and reads what is written above the staff", () => {
    const score = extractLyrics(mscx([[[[[["<i>Glo</i>ri&amp;a", ""]], { marker: "REFRAIN" }]]]]));
    expect(score.syllables[0].text).toBe("Glori&a");
    expect(score.markers).toEqual([{ measure: 0, text: "REFRAIN" }]);
  });

  it("finds nothing in a score without lyrics, and refuses what is not XML", () => {
    expect(extractLyrics(mscx([[[[[]]]]])).syllables).toEqual([]);
    expect(() => extractLyrics("<museScore><Score><Staff id=1>")).toThrow("could not be read");
  });
});
