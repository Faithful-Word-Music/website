import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { christmasSeason, thanksgiving } from "@/lib/church-calendar";
import {
  parsePlanningPhilosophy,
  PHILOSOPHY_MAX_CHARS,
  PHILOSOPHY_TOPICS_MAX,
  philosophyOutline,
  planningGuidance,
  selectSections,
  type PlanningPhilosophy,
} from "@/lib/ai/planning/philosophy";

/** The document itself, as the site ships it. */
const source = readFileSync(join(process.cwd(), "src/content/music-planning-philosophy.md"), "utf8");

const parsed = (text: string): PlanningPhilosophy => {
  const result = parsePlanningPhilosophy(text);
  if (!result.ok) throw new Error(`Not parsed: ${result.problem}`);
  return result.philosophy;
};

const sample = parsed(
  [
    "# A Philosophy",
    "",
    "## Purpose",
    "",
    "Sing out.",
    "",
    "---",
    "",
    "## Familiarity and **Song** Rotation",
    "",
    "### Completely New Songs",
    "",
    "Not more than once in a week.",
    "",
    "### Less Familiar Songs",
    "",
    "One to three a week.",
    "",
    "---",
    "",
    "## The Opener",
    "",
    "Familiar.",
    "",
    "## Seasonal Planning",
    "",
    "### Christmas Season",
    "",
    "Only Christmas songs.",
  ].join("\r\n"),
);

describe("the planning philosophy document", () => {
  const philosophy = parsed(source);

  it("is read into its own sections, within the size the AI is given", () => {
    expect(source.length).toBeLessThanOrEqual(PHILOSOPHY_MAX_CHARS);
    expect(philosophy.title).not.toBe("");
    expect(philosophy.sections.length).toBeGreaterThan(3);
    expect(new Set(philosophy.sections.map((section) => section.id)).size).toBe(philosophy.sections.length);
  });

  it("gives every section word for word: nothing added, nothing summarised", () => {
    const written = source.replace(/\r\n?/g, "\n");
    for (const section of philosophy.sections) {
      expect(section.text).not.toBe("");
      expect(written).toContain(section.text);
      expect(written).toContain(`## ${section.title}`);
    }
    // Between them the sections are the whole document: no part of it is unreachable.
    const total = philosophy.sections.reduce((sum, section) => sum + section.text.length, 0);
    expect(total).toBeGreaterThan(written.length * 0.9);
  });

  it("is given whole when no section is named", () => {
    const guidance = planningGuidance(philosophy, { today: "2026-10-05" });
    expect(guidance.whole).toBe(true);
    expect(guidance.sections.map((section) => section.title)).toEqual(philosophy.sections.map((section) => section.title));
    expect(guidance.otherSections).toBeUndefined();
    expect(JSON.stringify(guidance).length).toBeLessThan(PHILOSOPHY_MAX_CHARS + 4000);
  });
});

describe("parsePlanningPhilosophy", () => {
  it("keeps a section's parts inside it, and drops the rule between sections", () => {
    expect(sample.title).toBe("A Philosophy");
    expect(sample.sections.map((section) => section.id)).toEqual(["purpose", "familiarity-and-song-rotation", "the-opener", "seasonal-planning"]);
    expect(sample.sections[0].text).toBe("Sing out.");
    expect(sample.sections[1].title).toBe("Familiarity and Song Rotation");
    expect(sample.sections[1].parts).toEqual(["Completely New Songs", "Less Familiar Songs"]);
    expect(sample.sections[1].text).toBe(
      "### Completely New Songs\n\nNot more than once in a week.\n\n### Less Familiar Songs\n\nOne to three a week.",
    );
  });

  it("refuses a document it cannot use, rather than using part of it", () => {
    expect(parsePlanningPhilosophy("")).toEqual({ ok: false, problem: "empty" });
    expect(parsePlanningPhilosophy("  \n\n ")).toEqual({ ok: false, problem: "empty" });
    expect(parsePlanningPhilosophy("# Title\n\nJust a paragraph.")).toEqual({ ok: false, problem: "no-sections" });
    expect(parsePlanningPhilosophy("## Empty\n\n## Also empty\n")).toEqual({ ok: false, problem: "no-sections" });
    expect(parsePlanningPhilosophy("## Opener\n\nOne.\n\n## Opener\n\nTwo.")).toEqual({ ok: false, problem: "duplicate-section" });
    expect(parsePlanningPhilosophy(`## Long\n\n${"x".repeat(PHILOSOPHY_MAX_CHARS)}`)).toEqual({ ok: false, problem: "too-long" });
  });
});

describe("selectSections", () => {
  const titles = (topics: string[]) => selectSections(sample, topics).sections.map((section) => section.title);

  it("finds a section by its title, its id, or the way someone would say it", () => {
    expect(titles(["The Opener"])).toEqual(["The Opener"]);
    expect(titles(["the-opener"])).toEqual(["The Opener"]);
    expect(titles(["openers"])).toEqual(["The Opener"]);
    expect(titles(["seasonal"])).toEqual(["Seasonal Planning"]);
  });

  it("finds a section by one of its parts", () => {
    expect(titles(["new songs"])).toEqual(["Familiarity and Song Rotation"]);
    expect(titles(["Christmas"])).toEqual(["Seasonal Planning"]);
  });

  it("returns sections in the document's order, each once", () => {
    expect(titles(["Christmas", "opener", "seasonal planning", "purpose"])).toEqual(["Purpose", "The Opener", "Seasonal Planning"]);
  });

  it("hands back a topic that names nothing, and never guesses", () => {
    expect(selectSections(sample, ["tempo", "the"])).toEqual({ sections: [], notFound: ["tempo", "the"] });
    expect(selectSections(sample, ["opener", "minimum days"]).notFound).toEqual(["minimum days"]);
  });
});

describe("planningGuidance", () => {
  it("gives only the sections asked for, and names the rest", () => {
    const guidance = planningGuidance(sample, { topics: ["opener"], today: "2026-10-05" });
    expect(guidance.whole).toBe(false);
    expect(guidance.sections).toEqual([{ title: "The Opener", text: "Familiar." }]);
    expect(guidance.otherSections).toEqual(["Purpose", "Familiarity and Song Rotation", "Seasonal Planning"]);
    expect(guidance.notFound).toBeUndefined();
  });

  it("says how to read it: hard only where the text says so, and nothing may be added", () => {
    const guidance = planningGuidance(sample, { topics: ["purpose"], today: "2026-10-05" });
    expect(guidance.source).toContain("word for word");
    expect(guidance.howToRead).toContain("hard only where this text says so");
    expect(guidance.howToRead).toContain("do not add rules, numbers or limits");
  });

  it("answers a topic the document does not have with what it does have, not with a rule", () => {
    const guidance = planningGuidance(sample, { topics: ["minimum days between repeats"], today: "2026-10-05" });
    expect(guidance.sections).toEqual([]);
    expect(guidance.notFound).toEqual(["minimum days between repeats"]);
    expect(guidance.otherSections).toHaveLength(4);
  });

  it("dates the seasons only when they are wanted, from the church's own calendar", () => {
    expect(planningGuidance(sample, { topics: ["opener"], today: "2026-10-05" }).seasons).toBeUndefined();

    const seasonal = planningGuidance(sample, { topics: ["seasonal"], today: "2026-10-05" });
    expect(seasonal.seasons?.map((season) => season.year)).toEqual([2026, 2027]);
    expect(seasonal.seasons?.[0]).toMatchObject({ easter: "2026-04-05", thanksgiving: thanksgiving(2026), christmasSeason: christmasSeason(2026) });

    const dated = planningGuidance(sample, { topics: ["opener"], date: "2027-03-28", today: "2026-10-05" });
    expect(dated.seasons?.map((season) => season.year)).toEqual([2027, 2028]);
  });

  it("does not send a section twice in one question", () => {
    const given = new Set(["the-opener"]);
    const again = planningGuidance(sample, { topics: ["opener", "purpose"], today: "2026-10-05", given });
    expect(again.sections.map((section) => section.title)).toEqual(["Purpose"]);
    expect(again.alreadyGiven).toEqual(["The Opener"]);

    const rest = planningGuidance(sample, { today: "2026-10-05", given });
    expect(rest.sections.map((section) => section.title)).not.toContain("The Opener");
    expect(rest.whole).toBe(false);
  });

  it("takes no more topics than its limit", () => {
    const many = ["purpose", "opener", "seasonal", "new songs", "x1", "x2", "x3", "x4"];
    const guidance = planningGuidance(sample, { topics: many, today: "2026-10-05" });
    expect(guidance.notFound?.length).toBe(PHILOSOPHY_TOPICS_MAX - 4);
  });
});

describe("philosophyOutline", () => {
  it("lists the sections with their parts, in one line", () => {
    expect(philosophyOutline(sample)).toBe(
      "Purpose; Familiarity and Song Rotation (Completely New Songs, Less Familiar Songs); The Opener; Seasonal Planning (Christmas Season)",
    );
  });
});
