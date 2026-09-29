import { normalizeKey } from "@/lib/song-list";

/**
 * The key signature of a key as the sheet writes it ("Ab", "Cm", "F♯ minor",
 * "C Dorian"): how many sharps or flats, which ones, its relative key, and the
 * notes of its scale. Keys it cannot read give null.
 */

export type Mode = "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian";

export interface KeySignature {
  /** Sharps are positive, flats negative, 0 for none. */
  count: number;
  /** The accidentals in the order they are written, e.g. ["B♭", "E♭", "A♭"]. */
  accidentals: string[];
  mode: Mode;
  /**
   * The key sharing this signature: the relative minor of a major key ("Am"
   * for C), the relative major of a minor key ("E♭" for Cm), and for any other
   * mode the major key with the same notes ("B♭" for C Dorian).
   */
  relative: string;
  /** The key note's letter, "C" for C minor. */
  letter: string;
  /**
   * The scale from key note to key note, e.g. C D E♭ F G A♭ B♭ C - the notes
   * its key signature spells, so a minor key gets its natural minor.
   */
  scale: string[];
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
/** Letters in circle-of-fifths order: F is one flat, B five sharps. */
const FIFTHS = "FCGDAEB";
const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS = ["B", "E", "A", "D", "G", "C", "F"];

/** How far round the circle of fifths each mode's signature sits from its key note's major. */
const MODE_SHIFT: Record<Mode, number> = {
  lydian: 1,
  major: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  phrygian: -4,
  locrian: -5,
};

/** How the sheet may name each mode, after normalizeKey ("minor" is already "m"). */
const MODE_NAMES: Record<string, Mode> = {
  "": "major",
  ionian: "major",
  m: "minor",
  aeolian: "minor",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  locrian: "locrian",
};

/** The major key with this many sharps (or, negative, flats): 3 -> "A", -2 -> "B♭". */
function majorWith(count: number): string {
  const index = count + 1;
  const letter = FIFTHS[((index % 7) + 7) % 7];
  const sharps = Math.floor(index / 7);
  return letter + (sharps > 0 ? "♯".repeat(sharps) : "♭".repeat(-sharps));
}

export function keySignature(key: string): KeySignature | null {
  const match = /^([a-g])([b#]?)\s*([a-z]*)$/.exec(normalizeKey(key));
  if (!match) return null;

  const [, root, accidental, modeName] = match;
  const mode = MODE_NAMES[modeName];
  if (!mode) return null;

  const letter = root.toUpperCase();
  const tonic = FIFTHS.indexOf(letter) - 1 + (accidental === "#" ? 7 : accidental === "b" ? -7 : 0);
  const count = tonic + MODE_SHIFT[mode];
  // Beyond seven sharps or flats there is no key signature to write.
  if (Math.abs(count) > 7) return null;

  const accidentals =
    count >= 0
      ? SHARPS.slice(0, count).map((note) => `${note}♯`)
      : FLATS.slice(0, -count).map((note) => `${note}♭`);
  const start = LETTERS.indexOf(letter);
  const scale = Array.from({ length: 8 }, (_, degree) => {
    const name = LETTERS[(start + degree) % 7];
    return accidentals.find((note) => note.startsWith(name)) ?? name;
  });

  return {
    count,
    accidentals,
    mode,
    relative: mode === "major" ? `${majorWith(count + 3)}m` : majorWith(count),
    letter,
    scale,
  };
}
