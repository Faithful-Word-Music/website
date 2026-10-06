import { parsePlanningPhilosophy, type PhilosophyProblem, type PlanningPhilosophy } from "./philosophy";

/**
 * The planning philosophy as something that is EDITED: its sections taken
 * apart and put back together, what a change changed, and how two versions
 * differ. Pure - unit tested.
 *
 * The document is still one piece of Markdown, split at its own "## "
 * headings (philosophy.ts); an edit, by hand or proposed by Conductor, ends as
 * a whole new document that parsePlanningPhilosophy() must accept. There is no
 * second description of what sections it should have.
 */

/** How a version came to be. */
export type PhilosophySource = "seed" | "manual" | "ai" | "restore";

export interface PhilosophyRevisionSummary {
  id: number;
  at: string;
  /** The Clerk user who applied it; null for the first copy. */
  by: string | null;
  source: PhilosophySource;
  /** For a restore: the version brought back. */
  restoredFrom: number | null;
  /** The titles of the sections this version changed, added or removed. */
  changedSections: string[];
  note: string | null;
}

export interface PhilosophyRevision extends PhilosophyRevisionSummary {
  markdown: string;
}

/** A section as the editor holds it. */
export interface DraftSection {
  title: string;
  text: string;
}

export interface PhilosophyDraft {
  title: string;
  sections: DraftSection[];
}

export const PHILOSOPHY_EDIT_LIMITS = {
  /** A section's heading. */
  titleChars: 80,
  /** The note kept with a change. */
  noteChars: 300,
} as const;

export function toDraft(philosophy: PlanningPhilosophy): PhilosophyDraft {
  return { title: philosophy.title, sections: philosophy.sections.map((section) => ({ title: section.title, text: section.text })) };
}

/** A heading as one plain line: nothing in it can start another section. */
const headingText = (text: string) => text.replace(/[\r\n]+/g, " ").replace(/^#+\s*/, "").trim();

/** Text that would be read as a section heading, made into a part's heading instead. */
const bodyText = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (/^##\s/.test(line) || /^#\s/.test(line) ? `### ${line.replace(/^#+\s*/, "")}` : line))
    .join("\n")
    .trim();

/** The draft as the document: its title, then each section under its heading, a rule between them. */
export function composePhilosophy(draft: PhilosophyDraft): string {
  const sections = draft.sections.map((section) => `## ${headingText(section.title)}\n\n${bodyText(section.text)}`);
  const title = headingText(draft.title);
  return [...(title ? [`# ${title}`] : []), sections.join("\n\n---\n\n")].join("\n\n").trim();
}

/** The document with one section's text replaced; null when it has no such section. */
export function replaceSection(philosophy: PlanningPhilosophy, sectionId: string, text: string): string | null {
  if (!philosophy.sections.some((section) => section.id === sectionId)) return null;
  const draft = toDraft(philosophy);
  return composePhilosophy({
    title: draft.title,
    sections: philosophy.sections.map((section) => ({ title: section.title, text: section.id === sectionId ? text : section.text })),
  });
}

export type CheckedPhilosophy = { ok: true; philosophy: PlanningPhilosophy } | { ok: false; problem: PhilosophyProblem };

/** A document someone wants to apply, held to the same rules as the one that is read. */
export function checkPhilosophy(markdown: string): CheckedPhilosophy {
  return parsePlanningPhilosophy(markdown);
}

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * What one version changed from another: the titles of the sections whose
 * text changed, that were added, and that were removed (a renamed section is
 * one removed and one added). `reordered` when the same sections stand in a
 * different order. Whitespace alone is not a change.
 */
export function changedSections(before: PlanningPhilosophy, after: PlanningPhilosophy): { titles: string[]; reordered: boolean; titleChanged: boolean } {
  const was = new Map(before.sections.map((section) => [section.id, section]));
  const is = new Map(after.sections.map((section) => [section.id, section]));
  const titles: string[] = [];
  for (const section of after.sections) {
    const old = was.get(section.id);
    if (!old || squeeze(old.text) !== squeeze(section.text) || old.title !== section.title) titles.push(section.title);
  }
  for (const section of before.sections) if (!is.has(section.id)) titles.push(section.title);

  const shared = (list: PlanningPhilosophy, other: Map<string, unknown>) => list.sections.filter((section) => other.has(section.id)).map((section) => section.id);
  const reordered = shared(before, is).join("|") !== shared(after, was).join("|");
  return { titles, reordered, titleChanged: before.title !== after.title };
}

// ---------------------------------------------------------------------------
// Comparing two texts
// ---------------------------------------------------------------------------

export interface DiffPart {
  type: "same" | "add" | "remove";
  text: string;
}

/** The most cells the comparison's table may have; past it, whole lines are compared instead of words. */
const DIFF_CELLS_MAX = 4_000_000;

/** Words and the space between them, each its own piece, so the text can be put back exactly. */
const wordPieces = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];
const linePieces = (text: string) => text.match(/[^\n]*\n|[^\n]+/g) ?? [];

/** The longest run of pieces two lists share, as what stayed, what was added and what was taken out. */
function diffPieces(a: readonly string[], b: readonly string[]): DiffPart[] {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const table = new Uint32Array(rows * columns);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] =
        a[i] === b[j] ? table[(i + 1) * columns + j + 1] + 1 : Math.max(table[(i + 1) * columns + j], table[i * columns + j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts.at(-1);
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * columns + j] >= table[i * columns + j + 1]) {
      push("remove", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("remove", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return parts;
}

/**
 * Reads better: a phrase that was replaced is shown as ONE removal and one
 * addition, not word by word with the unchanged spaces between them left
 * standing ("a month." -> "two weeks," rather than "a"/"two", " ", "month."/"weeks,").
 * A run of changes broken only by white space is gathered into one.
 */
function gatherPhrases(parts: readonly DiffPart[]): DiffPart[] {
  const gathered: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed !== "") gathered.push({ type: "remove", text: removed });
    if (added !== "") gathered.push({ type: "add", text: added });
    removed = "";
    added = "";
  };

  parts.forEach((part, index) => {
    if (part.type === "remove") removed += part.text;
    else if (part.type === "add") added += part.text;
    else if (/^\s+$/.test(part.text) && (removed !== "" || added !== "") && parts[index + 1] && parts[index + 1].type !== "same") {
      // White space between two changes: it belongs to both the old phrase and the new one.
      removed += part.text;
      added += part.text;
    } else {
      flush();
      gathered.push(part);
    }
  });
  flush();
  return gathered;
}

/**
 * How `after` differs from `before`, word by word (line by line when the texts
 * are very long). The `same` and `remove` parts in order are `before`; the
 * `same` and `add` parts are `after`.
 */
export function diffText(before: string, after: string): DiffPart[] {
  if (before === after) return before === "" ? [] : [{ type: "same", text: before }];
  const words = [wordPieces(before), wordPieces(after)] as const;
  if ((words[0].length + 1) * (words[1].length + 1) <= DIFF_CELLS_MAX) return gatherPhrases(diffPieces(words[0], words[1]));
  const lines = [linePieces(before), linePieces(after)] as const;
  if ((lines[0].length + 1) * (lines[1].length + 1) <= DIFF_CELLS_MAX) return diffPieces(lines[0], lines[1]);
  return [
    { type: "remove", text: before },
    { type: "add", text: after },
  ];
}

/**
 * A comparison with its long unchanged stretches cut down to a little of the
 * text either side of each change, an ellipsis standing for what was left
 * out - so a one-sentence change to a long section is in view at once. For
 * reading only: the parts no longer rebuild either text.
 */
export function condenseDiff(parts: readonly DiffPart[], contextChars = 180): DiffPart[] {
  if (!parts.some((part) => part.type !== "same")) return [...parts];
  /** Cut at a word, so no word is shown in half. */
  const head = (text: string) => text.slice(0, contextChars).replace(/\S+$/, "").trimEnd();
  const tail = (text: string) => text.slice(-contextChars).replace(/^\S+/, "").trimStart();

  return parts.map((part, index) => {
    if (part.type !== "same") return part;
    const first = index === 0;
    const last = index === parts.length - 1;
    if (part.text.length <= contextChars * (first || last ? 1 : 2) + 40) return part;
    const text = first ? `… ${tail(part.text)}` : last ? `${head(part.text)} …` : `${head(part.text)} …\n\n… ${tail(part.text)}`;
    return { type: "same", text };
  });
}

export interface SectionComparison {
  title: string;
  change: "same" | "changed" | "added" | "removed";
  parts: DiffPart[];
}

/** Two versions side by side, section by section, in the later one's order with what it dropped at the end. */
export function comparePhilosophies(before: PlanningPhilosophy, after: PlanningPhilosophy): SectionComparison[] {
  const was = new Map(before.sections.map((section) => [section.id, section]));
  const is = new Set(after.sections.map((section) => section.id));
  return [
    ...after.sections.map((section): SectionComparison => {
      const old = was.get(section.id);
      if (!old) return { title: section.title, change: "added", parts: [{ type: "add", text: section.text }] };
      const same = squeeze(old.text) === squeeze(section.text);
      return { title: section.title, change: same ? "same" : "changed", parts: same ? [{ type: "same", text: section.text }] : diffText(old.text, section.text) };
    }),
    ...before.sections
      .filter((section) => !is.has(section.id))
      .map((section): SectionComparison => ({ title: section.title, change: "removed", parts: [{ type: "remove", text: section.text }] })),
  ];
}
