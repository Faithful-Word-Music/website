import { seasonDates } from "@/lib/church-calendar";

/**
 * The Music Director's planning philosophy, as the AI reads it.
 *
 * The philosophy itself is one Markdown document, written and edited by hand:
 * src/content/music-planning-philosophy.md. This file turns it into its own
 * sections and nothing more - there is no list of rules here, no numbers and
 * no schema of expected headings. Whatever the document says is the
 * philosophy; whatever it does not say is not.
 *
 *   - A section is each "## " heading and everything under it. Its "### "
 *     parts stay inside it.
 *   - Adding, renaming, reordering or removing a section needs no code change.
 *   - Every feature reads the same document through this file and load.ts:
 *     Conductor a section at a time (planningGuidance), a plan generator the
 *     whole of it (philosophy.markdown). Nothing here knows about Conductor.
 *
 * Pure - unit tested. See AI.md, "Planning Intelligence".
 */

/** The longest the document may be. Past this it is refused, not cut: half a philosophy is worse than none. */
export const PHILOSOPHY_MAX_CHARS = 24_000;
/** Sections one request may name. */
export const PHILOSOPHY_TOPICS_MAX = 6;

export interface PhilosophySection {
  /** The heading, slugged: "the-opener". */
  id: string;
  title: string;
  /** The titles of its "### " parts, in order. */
  parts: string[];
  /** Everything under the heading, as written. */
  text: string;
}

export interface PlanningPhilosophy {
  title: string;
  /** The whole document, as written. */
  markdown: string;
  sections: PhilosophySection[];
}

export type PhilosophyProblem = "empty" | "no-sections" | "duplicate-section" | "too-long";
export type ParsedPhilosophy = { ok: true; philosophy: PlanningPhilosophy } | { ok: false; problem: PhilosophyProblem };

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A heading's words without its Markdown emphasis. */
const heading = (line: string) => line.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();

/** A section's lines as its text: no rule between sections, no blank lines at either end. */
const body = (lines: string[]) =>
  lines
    .join("\n")
    .replace(/(\n\s*)+-{3,}\s*$/, "")
    .trim();

export function parsePlanningPhilosophy(source: string): ParsedPhilosophy {
  const markdown = source.replace(/\r\n?/g, "\n").trim();
  if (markdown === "") return { ok: false, problem: "empty" };
  if (markdown.length > PHILOSOPHY_MAX_CHARS) return { ok: false, problem: "too-long" };

  let title = "";
  const sections: PhilosophySection[] = [];
  let open: { title: string; parts: string[]; lines: string[] } | null = null;
  const close = () => {
    if (open) sections.push({ id: slug(open.title), title: open.title, parts: open.parts, text: body(open.lines) });
  };

  for (const line of markdown.split("\n")) {
    if (/^##\s/.test(line)) {
      close();
      open = { title: heading(line), parts: [], lines: [] };
    } else if (open) {
      if (/^###\s/.test(line)) open.parts.push(heading(line));
      open.lines.push(line);
    } else if (/^#\s/.test(line) && title === "") {
      title = heading(line);
    }
  }
  close();

  const kept = sections.filter((section) => section.id !== "" && section.text !== "");
  if (kept.length === 0) return { ok: false, problem: "no-sections" };
  if (new Set(kept.map((section) => section.id)).size !== kept.length) return { ok: false, problem: "duplicate-section" };
  return { ok: true, philosophy: { title, markdown, sections: kept } };
}

/** Words that say nothing about which section is meant. */
const SMALL_WORDS = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "that", "be", "should", "not", "how", "about", "my", "our"]);

/** The words of a heading or a topic, lowered, with a plural's "s" dropped: "Openers" is "opener". */
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !SMALL_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));

/**
 * The sections a list of topics names, in the document's order. A topic is a
 * section's title or id, or words from its title or from one of its parts'
 * ("new songs" is in "Familiarity and Song Rotation"). A topic that names
 * nothing is handed back, never guessed at.
 */
export function selectSections(philosophy: PlanningPhilosophy, topics: readonly string[]): { sections: PhilosophySection[]; notFound: string[] } {
  const chosen = new Set<string>();
  const notFound: string[] = [];

  for (const topic of topics) {
    const exact = philosophy.sections.filter((section) => section.id === slug(topic));
    const asked = words(topic);
    const matches =
      exact.length > 0
        ? exact
        : asked.length === 0
          ? []
          : philosophy.sections.filter((section) =>
              [section.title, ...section.parts].some((title) => {
                const titled = words(title);
                return asked.every((word) => titled.some((candidate) => candidate.startsWith(word)));
              }),
            );
    if (matches.length === 0) notFound.push(topic);
    for (const section of matches) chosen.add(section.id);
  }

  return { sections: philosophy.sections.filter((section) => chosen.has(section.id)), notFound };
}

/** The document's sections in one line, each with its parts: what there is to ask for. */
export function philosophyOutline(philosophy: PlanningPhilosophy): string {
  return philosophy.sections.map((section) => (section.parts.length > 0 ? `${section.title} (${section.parts.join(", ")})` : section.title)).join("; ");
}

/** A section that turns on a date of the church's year. */
const SEASONAL = /\b(christmas|easter|thanksgiving)\b/i;

export interface PlanningGuidance {
  source: string;
  howToRead: string;
  /** Whether this is the whole document. */
  whole: boolean;
  sections: { title: string; text: string }[];
  /** Sections asked for again in the same question: their text is already in the conversation. */
  alreadyGiven?: string[];
  /** What else the document has, when only part of it was asked for. */
  otherSections?: string[];
  notFound?: string[];
  /** The dates the seasonal guidance turns on, for the year asked about and the next. */
  seasons?: ReturnType<typeof seasonDates>[];
}

/**
 * The philosophy as one bounded answer: the sections asked for (all of them
 * when none is named), word for word, with how to read them. Nothing is
 * added to the Director's text and nothing is summarised.
 *
 * `given` is the ids already returned in this question: a section asked for
 * twice is named, not sent twice.
 */
export function planningGuidance(
  philosophy: PlanningPhilosophy,
  input: { topics?: readonly string[]; date?: string; today: string; given?: ReadonlySet<string> },
): PlanningGuidance {
  const topics = (input.topics ?? []).slice(0, PHILOSOPHY_TOPICS_MAX);
  const whole = topics.length === 0;
  const found = whole ? { sections: philosophy.sections, notFound: [] } : selectSections(philosophy, topics);
  const fresh = found.sections.filter((section) => !input.given?.has(section.id));
  const repeated = found.sections.filter((section) => input.given?.has(section.id));
  const year = Number((input.date ?? input.today).slice(0, 4));
  const seasonal = input.date !== undefined || fresh.some((section) => SEASONAL.test(section.text));

  return {
    source: "The Music Director's own planning philosophy, word for word from the site's document.",
    howToRead:
      "A rule is hard only where this text says so (must, required, a hard rule); the rest is a preference to weigh. What this text does not say is not the Director's policy - do not add rules, numbers or limits to it.",
    whole: whole && repeated.length === 0,
    sections: fresh.map((section) => ({ title: section.title, text: section.text })),
    ...(repeated.length > 0 ? { alreadyGiven: repeated.map((section) => section.title) } : {}),
    ...(whole ? {} : { otherSections: philosophy.sections.filter((section) => !found.sections.includes(section)).map((section) => section.title) }),
    ...(found.notFound.length > 0 ? { notFound: found.notFound } : {}),
    ...(seasonal ? { seasons: [seasonDates(year), seasonDates(year + 1)] } : {}),
  };
}
