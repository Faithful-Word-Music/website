import { createHash } from "node:crypto";

import type { LyricSyllable, ScoreLyrics } from "./musescore";

/**
 * From the syllables of a score (musescore.ts) to a song's words, in the
 * sections the score really has. Pure functions.
 *
 * How this library's scores are written (checked against the real files):
 *
 *   - Each verse is a lyric LINE under the same notes: line 0 is verse 1,
 *     line 1 verse 2. Their text usually begins "1.", "2.".
 *   - A REFRAIN is written once, on line 0 only, in the measures AFTER the
 *     other lines stop. Some scores mark it "REFRAIN" or "CHORUS"; most do not.
 *   - Words on line 0 BEFORE the other lines begin are an opening sung once.
 *   - A Psalm keeps the Bible's verse numbers inside its text, and its lines
 *     are passes through a repeat rather than numbered stanzas.
 *   - An echo, or the men's part, sits in a second voice or on another staff,
 *     and repeats words the main line already has.
 *
 * So: the main line is the staff and voice with the most syllables. Where
 * the later lines have words is the verse region; line 0 splits around it.
 * Another voice's words are kept only when the main line does not have them.
 */

/** Raised whenever extraction or sectioning changes what a file yields: every song is then read again. */
export const PARSER_VERSION = 1;

export type SectionKind =
  /** A numbered stanza. */
  | "verse"
  /** Sung after the verses. */
  | "refrain"
  /** Words that belong to no numbered verse: a song with one lyric line, an opening, a pass of a Psalm. */
  | "section"
  /** Words only another voice sings (an echo, a descant). */
  | "part";

export interface LyricSection {
  kind: SectionKind;
  /** The verse's number; null for everything else. */
  number: number | null;
  text: string;
}

export interface SongContent {
  sections: LyricSection[];
  /** Every section in order, labelled, as a person would read it. */
  text: string;
  /** `text` without its labels, folded for matching (searchText). */
  searchText: string;
  words: number;
  /** Changes exactly when the sections do. */
  hash: string;
}

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Text folded for matching a typed phrase: lower case, accents and
 * apostrophes dropped ("ev'ry" and "ev’ry" are both "evry"), every other
 * mark a space. What a person types is folded the same way.
 */
export function searchText(text: string): string {
  return squeeze(
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['‘’ʼ`]/g, "")
      .replace(/[^a-z0-9]+/g, " "),
  );
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function sectionLabel(section: Pick<LyricSection, "kind" | "number">): string | null {
  switch (section.kind) {
    case "verse":
      return section.number === null ? "Verse" : `Verse ${section.number}`;
    case "refrain":
      return "Refrain";
    case "part":
      return "Other voice";
    default:
      return null;
  }
}

/** A word, with the measure its first syllable is in. */
interface Word {
  text: string;
  measure: number;
}

/** A lyric line's syllables joined into words. */
function wordsOf(syllables: readonly LyricSyllable[]): Word[] {
  const words: Word[] = [];
  let open: Word | null = null;
  for (const syllable of syllables) {
    if (open) open.text += syllable.text;
    else {
      open = { text: syllable.text, measure: syllable.measure };
      words.push(open);
    }
    if (!syllable.joins) open = null;
  }
  return words;
}

const textOf = (words: readonly Word[]) => squeeze(words.map((word) => word.text).join(" "));

/** "2." (or "2 .") at the start of a verse's line. */
const VERSE_NUMBER = /^(\d{1,2})\s?\.\s*/;
/** A Bible verse number inside the text, as the Psalms keep them: "... trust. 2.For, lo". */
const INLINE_NUMBER = /\s\d{1,3}\.\s?[A-Za-z"]/;
/** What a score writes above its refrain. */
const REFRAIN_MARK = /\b(refrain|chorus)\b/i;
/** A tail of line 0 shorter than this is the verse's own last words, not a refrain. */
const REFRAIN_MIN_WORDS = 3;
/** An unnumbered line this much shorter than the verses is not another verse (an alternative last line, say). */
const SHORT_LINE = 0.4;
/** Another voice's words are kept only when at least this many pairs of words are new to the song. */
const NEW_PAIRS_MIN = 3;

/** One staff and voice: its lyric lines, in order. */
interface Stream {
  syllables: number;
  lines: Array<{ line: number; words: Word[] }>;
}

function streamsOf(score: ScoreLyrics): Stream[] {
  const byStream = new Map<string, Map<number, LyricSyllable[]>>();
  for (const syllable of score.syllables) {
    const key = `${syllable.staff}|${syllable.voice}`;
    const lines = byStream.get(key) ?? new Map<number, LyricSyllable[]>();
    byStream.set(key, lines);
    const line = lines.get(syllable.line);
    if (line) line.push(syllable);
    else lines.set(syllable.line, [syllable]);
  }
  return [...byStream.values()].map((lines) => ({
    syllables: [...lines.values()].reduce((total, line) => total + line.length, 0),
    lines: [...lines]
      .sort((a, b) => a[0] - b[0])
      .map(([line, syllables]) => ({ line, words: wordsOf(syllables) }))
      .filter((line) => line.words.length > 0),
  }));
}

const numberOf = (words: readonly Word[]): number | null => {
  const found = VERSE_NUMBER.exec(textOf(words));
  return found ? Number(found[1]) : null;
};

/**
 * A numbered verse's words, split where a LATER verse was written on the same
 * line further along the score ("... what a Saviour! 5. When He comes"): a
 * word that is a verse number no line starts with.
 */
function splitVerses(number: number, words: readonly Word[], taken: ReadonlySet<number>): Array<{ number: number; text: string }> {
  const verses: Array<{ number: number; words: Word[] }> = [{ number, words: [] }];
  words.forEach((word, index) => {
    const found = index > 0 ? /^(\d{1,2})\.(.*)$/.exec(word.text) : null;
    const next = found ? Number(found[1]) : null;
    if (found && next !== null && next > number && !taken.has(next) && !verses.some((verse) => verse.number === next)) {
      verses.push({ number: next, words: found[2] ? [{ ...word, text: found[2] }] : [] });
    } else {
      verses.at(-1)!.words.push(word);
    }
  });
  return verses.map((verse) => ({ number: verse.number, text: textOf(verse.words).replace(VERSE_NUMBER, "") }));
}

/** The sections of the main line. */
function mainSections(stream: Stream, score: ScoreLyrics): LyricSection[] {
  const [first, ...later] = stream.lines;
  if (!first) return [];
  if (later.length === 0) return [{ kind: "section", number: null, text: textOf(first.words) }];

  // Where the later lines have words is where the verses are.
  const measures = later.flatMap((line) => line.words.map((word) => word.measure));
  const versesBegin = Math.min(...measures);
  const versesEnd = Math.max(...measures);

  const opening = first.words.filter((word) => word.measure < versesBegin);
  let firstVerse = first.words.filter((word) => word.measure >= versesBegin && word.measure <= versesEnd);
  let tail = first.words.filter((word) => word.measure > versesEnd);
  if (tail.length < REFRAIN_MIN_WORDS) {
    firstVerse = [...firstVerse, ...tail];
    tail = [];
  }

  // How the lines are numbered. Most hymns number every line ("1.", "2."); a
  // few miss one, or none; a Psalm keeps the Bible's numbers inside its text
  // instead, and its lines are passes through a repeat, not stanzas.
  const lines = [firstVerse, ...later.map((line) => line.words)];
  const numbers = [numberOf(opening.length > 0 ? first.words : firstVerse), ...later.map((line) => numberOf(line.words))];
  const given = numbers.filter((number): number is number => number !== null);
  const rising = given.every((number, index) => index === 0 || number > given[index - 1]);
  const everyText = stream.lines.map((line) => textOf(line.words)).join(" ");
  // One number alone proves nothing: a Psalm's opening begins "1." as well.
  const numbered = numbers[0] !== null && rising && given.length >= 2 && given.length * 2 >= lines.length;
  const inOrder = given.length === 0 && !INLINE_NUMBER.test(everyText);

  const sections: LyricSection[] = [];
  const add = (kind: SectionKind, number: number | null, text: string) => {
    if (text !== "") sections.push({ kind, number, text });
  };

  if (numbered) {
    const lengths = lines.filter((_, index) => numbers[index] !== null).map((words) => words.length).sort((a, b) => a - b);
    const usual = lengths[Math.floor(lengths.length / 2)] ?? 0;
    const taken = new Set(given);
    add("section", null, textOf(opening).replace(VERSE_NUMBER, ""));

    let last = 0;
    const verses: LyricSection[] = [];
    lines.forEach((words, index) => {
      const number = numbers[index] ?? (words.length >= usual * SHORT_LINE ? last + 1 : null);
      if (number === null) return add("section", null, textOf(words));
      last = number;
      for (const verse of splitVerses(number, words, taken)) {
        if (verse.text !== "") verses.push({ kind: "verse", number: verse.number, text: verse.text });
      }
    });
    sections.push(...verses.sort((a, b) => a.number! - b.number!));
  } else {
    add("section", null, textOf(opening));
    lines.forEach((words, index) => add(inOrder ? "verse" : "section", inOrder ? index + 1 : null, textOf(words)));
  }

  const marked = score.markers.some((marker) => REFRAIN_MARK.test(marker.text));
  add(numbered || inOrder || marked ? "refrain" : "section", null, textOf(tail));
  return sections;
}

/** The words of a text, folded, and every pair of neighbours among them. */
const foldedWords = (text: string) => text.split(" ").map(searchText);
const pairsOf = (folded: readonly string[]) => {
  const words = folded.filter(Boolean);
  return words.slice(1).map((word, index) => `${words[index]} ${word}`);
};

/**
 * A song's sections from its score. Empty when the score has no lyrics (an
 * instrumental piece).
 */
export function sectionsFromScore(score: ScoreLyrics): LyricSection[] {
  const streams = streamsOf(score).sort((a, b) => b.syllables - a.syllables);
  const [main, ...others] = streams;
  if (!main) return [];

  const sections = mainSections(main, score);
  const known = new Set(sections.flatMap((section) => pairsOf(foldedWords(section.text))));

  // Another voice or staff mostly repeats the main line (an echo, the men's
  // part). Only what it says that the song does not already have is kept:
  // from its first new pair of words to its last.
  for (const stream of others) {
    for (const line of stream.lines) {
      const words = textOf(line.words).replace(VERSE_NUMBER, "").split(" ");
      const folded = words.map(searchText);
      const fresh: number[] = [];
      let previous = -1;
      folded.forEach((word, index) => {
        if (word === "") return;
        if (previous >= 0 && !known.has(`${folded[previous]} ${word}`)) fresh.push(previous, index);
        previous = index;
      });
      const pairs = pairsOf(folded);
      if (new Set(pairs.filter((pair) => !known.has(pair))).size < NEW_PAIRS_MIN) continue;

      sections.push({ kind: "part", number: null, text: words.slice(Math.min(...fresh), Math.max(...fresh) + 1).join(" ") });
      for (const pair of pairs) known.add(pair);
    }
  }
  return sections;
}

/** The sections as one readable text, each under its label. */
export function lyricsText(sections: readonly LyricSection[]): string {
  return sections
    .map((section) => {
      const label = sectionLabel(section);
      return label ? `${label}\n${section.text}` : section.text;
    })
    .join("\n\n");
}

/** Everything the index keeps about a song's words; null when it has none. */
export function songContent(score: ScoreLyrics): SongContent | null {
  const sections = sectionsFromScore(score);
  if (sections.length === 0) return null;
  const plain = sections.map((section) => section.text).join(" ");
  return {
    sections,
    text: lyricsText(sections),
    searchText: searchText(plain),
    words: plain.split(" ").filter(Boolean).length,
    hash: sha256(JSON.stringify(sections.map(({ kind, number, text }) => [kind, number, text]))),
  };
}

// ---------------------------------------------------------------------------
// What is embedded
// ---------------------------------------------------------------------------

/** The most characters of one text sent to the embedding model (its limit is about 8,000 tokens). */
const EMBEDDING_CHARS = 12_000;

/**
 * The text embedded for a whole song, and for one of its sections. The same
 * text always embeds the same way, so its hash is what an embedding is kept
 * under (store.ts): the same words are never embedded twice.
 *
 * A whole song is its words ALONE: with the title in front, songs came out
 * "similar" for sharing a word of their titles. A section goes under its
 * song's title, so a two-line refrain is still about something.
 */
export function songEmbeddingText(sections: readonly LyricSection[]): string {
  return sections
    .map((section) => section.text)
    .join("\n")
    .slice(0, EMBEDDING_CHARS);
}

export function sectionEmbeddingText(title: string, section: LyricSection): string {
  const label = sectionLabel(section);
  return `${title}${label ? ` (${label})` : ""}\n\n${section.text}`.slice(0, EMBEDDING_CHARS);
}
