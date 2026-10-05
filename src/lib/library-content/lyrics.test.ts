import { describe, expect, it } from "vitest";

import { mscx, verses, words, type Measure } from "@/lib/__fixtures__/musescore";

import { lyricsText, searchText, sectionEmbeddingText, sectionsFromScore, songContent, songEmbeddingText } from "./lyrics";
import { extractLyrics } from "./musescore";

const read = (staves: Measure[][], version: 3 | 4 = 4) => sectionsFromScore(extractLyrics(mscx(staves, version)));
const shape = (staves: Measure[][]) => read(staves).map((section) => `${section.kind}${section.number ?? ""}: ${section.text}`);

describe("sectionsFromScore", () => {
  it("reads each lyric line as a verse, and what only the first line goes on to as the refrain", () => {
    expect(
      shape([
        [
          ...verses("1. Dying with Jesus by death", "2. Never a trial that He", "3.Never a heartache and never"),
          ...words("Moment by moment I'm kept"),
        ],
      ]),
    ).toEqual([
      "verse1: Dying with Jesus by death",
      "verse2: Never a trial that He",
      "verse3: Never a heartache and never",
      "refrain: Moment by moment I'm kept",
    ]);
  });

  it("joins syllables into words", () => {
    const staff: Measure[] = [
      [[[["1. Des", "begin"], ["2. Let", "", 1]], [["ti", "middle"], ["the", "", 1]]]],
      [[[["tute", "end"], ["world", "", 1]]]],
    ];
    expect(shape([staff])).toEqual(["verse1: Destitute", "verse2: Let the world"]);
  });

  it("is one section for a song with a single lyric line", () => {
    expect(shape([words("Behold He comes! And ev'ry eye")])).toEqual(["section: Behold He comes! And ev'ry eye"]);
  });

  it("forgives a number written loosely or left off one line, and numbers a song that has none", () => {
    expect(shape([verses("1 .A mighty Fortress is", "2. Did we in our", "4/O the joy of")])).toEqual([
      "verse1: A mighty Fortress is",
      "verse2: Did we in our",
      "verse3: 4/O the joy of",
    ]);
    expect(shape([verses("ywhere with Jesus I can", "ywhere with Jesus I am")])).toEqual([
      "verse1: ywhere with Jesus I can",
      "verse2: ywhere with Jesus I am",
    ]);
  });

  it("does not call a short unnumbered line a verse", () => {
    expect(shape([verses("1. Out in the highways and byways of life", "2. Tell the sweet story of Christ and His", "Love as you")])).toEqual([
      "section: Love as you",
      "verse1: Out in the highways and byways of life",
      "verse2: Tell the sweet story of Christ and His",
    ]);
  });

  it("finds a later verse written further along another verse's line", () => {
    expect(
      shape([
        [
          ...verses("1. Man of Sorrows what a", "2. Bearing shame and scoffing rude"),
          ...words("5. When He comes our glorious King", 1),
        ],
      ]),
    ).toEqual(["verse1: Man of Sorrows what a", "verse2: Bearing shame and scoffing rude", "verse5: When He comes our glorious King"]);
  });

  it("keeps a Psalm's own verse numbers and does not call its lines verses", () => {
    expect(
      shape([
        [
          ...words("1.In the LORD put I my trust: 2.For, lo, the wicked"),
          ...verses("be destroyed, what can", "but the wicked and"),
          ...words("In the LORD put I"),
        ],
      ]),
    ).toEqual([
      "section: 1.In the LORD put I my trust: 2.For, lo, the wicked",
      "section: be destroyed, what can",
      "section: but the wicked and",
      "section: In the LORD put I",
    ]);
  });

  it("keeps a verse's own last word or two with the verse", () => {
    expect(shape([[...verses("1. Praise Him praise Him", "2. Jesus our blessed"), ...words("A-men")]])).toEqual([
      "verse1: Praise Him praise Him A-men",
      "verse2: Jesus our blessed",
    ]);
  });

  it("drops another voice that only echoes, and keeps what only it sings", () => {
    const main = [...verses("1. Low in the grave He lay", "2. Vainly they watch His bed"), ...words("Up from the grave He arose")];
    const echo: Measure[] = [...words("He arose He arose")];
    expect(shape([main, echo]).some((line) => line.startsWith("part"))).toBe(false);

    const descant: Measure[] = [...words("grave He arose And I know yes I know He lives")];
    expect(shape([main, descant]).at(-1)).toBe("part: arose And I know yes I know He lives");
  });

  it("takes the fullest voice as the song, wherever it is written", () => {
    const [first] = read([words("Hallelujah"), verses("1. For the Lord God omnipotent", "2. The kingdom of this world")]);
    expect(first).toEqual({ kind: "verse", number: 1, text: "For the Lord God omnipotent" });
  });

  it("uses a score's own REFRAIN mark when the lines are not numbered verses", () => {
    const staff: Measure[] = [
      ...verses("1.In thee O 2.do", "put my trust always"),
      [[{ marker: "CHORUS" }, [["Bless", ""]]]],
      ...words("the LORD O my soul"),
    ];
    expect(shape([staff]).at(-1)).toBe("refrain: Bless the LORD O my soul");
  });

  it("is empty for a score with no lyrics", () => {
    expect(read([[[[[]]]]])).toEqual([]);
    expect(songContent(extractLyrics(mscx([[[[[]]]]])))).toBeNull();
  });
});

describe("songContent", () => {
  const score = () => extractLyrics(mscx([[...verses("1. Ev'ry day with Jesus", "2. Ev’ry day He's near"), ...words("Sweeter than the day before")]]));

  it("keeps the readable text, the folded text, a count and a hash", () => {
    const content = songContent(score())!;
    expect(content.text).toBe("Verse 1\nEv'ry day with Jesus\n\nVerse 2\nEv’ry day He's near\n\nRefrain\nSweeter than the day before");
    expect(content.searchText).toBe("evry day with jesus evry day hes near sweeter than the day before");
    expect(content.words).toBe(13);
    expect(content.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(lyricsText(content.sections)).toBe(content.text);
  });

  it("has the same hash for the same words, and another for different ones", () => {
    const same = songContent(score())!;
    const changed = songContent(extractLyrics(mscx([[...verses("1. Ev'ry day with Jesus", "2. Ev’ry day He's near"), ...words("Sweeter than the day BEFORE")]])))!;
    expect(songContent(score())!.hash).toBe(same.hash);
    expect(changed.hash).not.toBe(same.hash);
  });
});

describe("searchText", () => {
  it("folds case, accents, apostrophes and punctuation the same for lyrics and for what is typed", () => {
    expect(searchText("  Prone to wander, Lord — I feel it!  ")).toBe("prone to wander lord i feel it");
    expect(searchText("Heav’n's eternal day’s")).toBe(searchText("heavns eternal days"));
    expect(searchText("Glória in excélsis")).toBe("gloria in excelsis");
    expect(searchText("?!")).toBe("");
  });
});

describe("what is embedded", () => {
  const sections = read([[...verses("1. Jesus loves me", "2. Jesus loves me still"), ...words("Yes Jesus loves me")]]);

  it("is a whole song's words alone, and a section under its song's title", () => {
    expect(songEmbeddingText(sections)).toBe("Jesus loves me\nJesus loves me still\nYes Jesus loves me");
    expect(sectionEmbeddingText("Jesus Loves Me", sections[2])).toBe("Jesus Loves Me (Refrain)\n\nYes Jesus loves me");
    expect(sectionEmbeddingText("Psalm 117", { kind: "section", number: null, text: "O praise the LORD" })).toBe("Psalm 117\n\nO praise the LORD");
  });
});
