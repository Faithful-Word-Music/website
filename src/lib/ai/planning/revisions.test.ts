import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { actor, director, musician } from "../__fixtures__/memory";
import { PHILOSOPHY, philosophyStore } from "../__fixtures__/philosophy";
import { plannerInstructions } from "../service-planner/prompt";
import { parsePlanningPhilosophy, PHILOSOPHY_MAX_CHARS, type PlanningPhilosophy } from "./philosophy";
import { changedSections, checkPhilosophy, comparePhilosophies, composePhilosophy, condenseDiff, diffText, replaceSection, toDraft } from "./revisions";
import { restorePhilosophy, savePhilosophy } from "./service";

const parse = (markdown: string): PlanningPhilosophy => {
  const parsed = parsePlanningPhilosophy(markdown);
  if (!parsed.ok) throw new Error(`not a philosophy: ${parsed.problem}`);
  return parsed.philosophy;
};

const document = readFileSync(join(process.cwd(), "src/content/music-planning-philosophy.md"), "utf8");

describe("the philosophy as sections to edit", () => {
  it("takes the real document apart and puts it back with nothing lost", () => {
    const original = parse(document);
    const again = parse(composePhilosophy(toDraft(original)));
    expect(again.title).toBe(original.title);
    expect(again.sections).toEqual(original.sections);
    // Putting it back a second time changes nothing more.
    expect(composePhilosophy(toDraft(again))).toBe(again.markdown);
  });

  it("replaces one section's text and leaves every other word alone", () => {
    const before = parse(PHILOSOPHY);
    const markdown = replaceSection(before, "recent-usage", "Recent usage is considered, but is secondary to familiarity.");
    const after = parse(markdown!);
    expect(after.sections.map((section) => section.title)).toEqual(["Purpose", "Recent Usage", "Christmas Season"]);
    expect(after.sections[1].text).toBe("Recent usage is considered, but is secondary to familiarity.");
    expect(after.sections[0]).toEqual(before.sections[0]);
    expect(after.sections[2]).toEqual(before.sections[2]);
    expect(replaceSection(before, "no-such-section", "Anything.")).toBeNull();
  });

  it("keeps text typed into a section from starting a section of its own", () => {
    const markdown = composePhilosophy({ title: "Philosophy", sections: [{ title: "Purpose\n## Sneaky", text: "Sing out.\n## Another Heading\nMore." }] });
    const parsed = parse(markdown);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe("Purpose ## Sneaky");
    expect(parsed.sections[0].parts).toEqual(["Another Heading"]);
  });

  it("says which sections a change touched: changed, added, removed, renamed, reordered", () => {
    const before = parse(PHILOSOPHY);
    const edit = (change: (draft: ReturnType<typeof toDraft>) => void) => {
      const draft = toDraft(before);
      change(draft);
      return changedSections(before, parse(composePhilosophy(draft)));
    };
    expect(edit(() => {})).toEqual({ titles: [], reordered: false, titleChanged: false });
    expect(edit((draft) => (draft.sections[1].text = "Recent usage is secondary.")).titles).toEqual(["Recent Usage"]);
    // Whitespace alone is not a change.
    expect(edit((draft) => (draft.sections[1].text = "Do not repeat a song   within a month.\n")).titles).toEqual([]);
    expect(edit((draft) => draft.sections.push({ title: "Easter", text: "Sing of the resurrection." })).titles).toEqual(["Easter"]);
    expect(edit((draft) => draft.sections.splice(1, 1)).titles).toEqual(["Recent Usage"]);
    expect(edit((draft) => (draft.sections[1].title = "Repetition")).titles).toEqual(["Repetition", "Recent Usage"]);
    expect(edit((draft) => draft.sections.reverse())).toEqual({ titles: [], reordered: true, titleChanged: false });
  });

  it("holds an edited document to the rules the AI reads it by", () => {
    expect(checkPhilosophy(PHILOSOPHY).ok).toBe(true);
    expect(checkPhilosophy("")).toEqual({ ok: false, problem: "empty" });
    expect(checkPhilosophy("# Title only")).toEqual({ ok: false, problem: "no-sections" });
    expect(checkPhilosophy("## Purpose\n\nOne.\n\n## Purpose\n\nTwo.")).toEqual({ ok: false, problem: "duplicate-section" });
    expect(checkPhilosophy(`## Purpose\n\n${"x".repeat(PHILOSOPHY_MAX_CHARS)}`)).toEqual({ ok: false, problem: "too-long" });
  });
});

describe("comparing two versions", () => {
  it("marks what was added and what was taken out, and can rebuild both texts", () => {
    const before = "Do not repeat a song within a month.";
    const after = "Do not repeat a song within two weeks, unless it is the insert.";
    const parts = diffText(before, after);
    const join = (types: string[]) => parts.filter((part) => types.includes(part.type)).map((part) => part.text).join("");
    expect(join(["same", "remove"])).toBe(before);
    expect(join(["same", "add"])).toBe(after);
    expect(parts.find((part) => part.type === "remove")?.text).toContain("a month.");
    expect(parts.filter((part) => part.type === "add").map((part) => part.text).join("")).toContain("two weeks,");
    expect(parts[0]).toEqual({ type: "same", text: "Do not repeat a song within " });
  });

  it("copes with nothing, with no change and with very long texts", () => {
    expect(diffText("", "")).toEqual([]);
    expect(diffText("Same.", "Same.")).toEqual([{ type: "same", text: "Same." }]);
    expect(diffText("", "New.")).toEqual([{ type: "add", text: "New." }]);
    const long = Array.from({ length: 4000 }, (_, index) => `word${index}`).join(" ");
    const parts = diffText(long, `${long} more`);
    expect(parts.filter((part) => part.type !== "remove").map((part) => part.text).join("")).toBe(`${long} more`);
  });

  it("can show only the text around a change, for a long section", () => {
    const opening = Array.from({ length: 120 }, (_, index) => `opening${index}`).join(" ");
    const closing = Array.from({ length: 120 }, (_, index) => `closing${index}`).join(" ");
    const condensed = condenseDiff(diffText(`${opening} old middle ${closing}`, `${opening} new middle ${closing}`));
    expect(condensed.map((part) => part.type)).toEqual(["same", "remove", "add", "same"]);
    expect(condensed[0].text.startsWith("… ")).toBe(true);
    // Right up to the change, space and all, so the words still join.
    expect(condensed[0].text.endsWith("opening119 ")).toBe(true);
    expect(condensed[0].text).not.toContain("opening0 ");
    expect(condensed[3].text.endsWith(" …")).toBe(true);
    expect(condensed[3].text).toContain("closing0");
    expect(condensed[3].text).not.toContain("closing119");
    // Nothing changed, or little to cut: left as it is.
    expect(condenseDiff(diffText(opening, opening))).toEqual([{ type: "same", text: opening }]);
    expect(condenseDiff(diffText("A short one.", "A short two."))).toEqual(diffText("A short one.", "A short two."));
  });

  it("sets two versions side by side, section by section", () => {
    const before = parse(PHILOSOPHY);
    const draft = toDraft(before);
    draft.sections[1].text = "Recent usage is secondary.";
    draft.sections.splice(2, 1);
    draft.sections.push({ title: "Easter", text: "Sing of the resurrection." });
    const compared = comparePhilosophies(before, parse(composePhilosophy(draft)));
    expect(compared.map((section) => [section.title, section.change])).toEqual([
      ["Purpose", "same"],
      ["Recent Usage", "changed"],
      ["Easter", "added"],
      ["Christmas Season", "removed"],
    ]);
  });
});

describe("changing the philosophy", () => {
  const edited = PHILOSOPHY.replace("Do not repeat a song within a month.", "Recent usage is considered, but is secondary to familiarity.");

  it("starts from the document the site ships with", () => {
    const { revisions } = philosophyStore(parse(document).markdown);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ source: "seed", by: null });
    expect(parse(revisions[0].markdown).sections.length).toBeGreaterThan(5);
  });

  it("applies a manual edit as a new version, recording who, how and what changed", async () => {
    const { deps, revisions } = philosophyStore();
    const result = await savePhilosophy(director, { markdown: edited, source: "manual", note: "  Too strict  about repeats. ", baseRevisionId: 1 }, deps);
    expect(result).toMatchObject({ ok: true, revision: { id: 2, source: "manual", by: "user_director", changedSections: ["Recent Usage"], note: "Too strict about repeats." } });
    expect(revisions).toHaveLength(2);
    // The first version is still there, word for word.
    expect(revisions[0].markdown).toBe(PHILOSOPHY);
    expect((await deps.current())?.markdown).toContain("secondary to familiarity");
  });

  it("is only for someone holding manage_planning_philosophy, whatever else they hold", async () => {
    for (const who of [musician, actor("user_x", "use_ai", "manage_global_ai_memory", "manage_service_plans"), actor("user_y")]) {
      const { deps, revisions } = philosophyStore();
      expect(await savePhilosophy(who, { markdown: edited, source: "manual", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await savePhilosophy(who, { markdown: edited, source: "ai", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await restorePhilosophy(who, { revisionId: 1, baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(revisions).toHaveLength(1);
    }
  });

  it("refuses a change made from a version that is no longer the one in force", async () => {
    const { deps, revisions } = philosophyStore();
    await savePhilosophy(director, { markdown: edited, source: "manual", baseRevisionId: 1 }, deps);
    const stale = PHILOSOPHY.replace("sing out", "sing out loudly");
    expect(await savePhilosophy(director, { markdown: stale, source: "manual", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "conflict" });
    expect(revisions).toHaveLength(2);
  });

  it("refuses a document the AI could not read, and a change that changes nothing", async () => {
    const { deps, revisions } = philosophyStore();
    expect(await savePhilosophy(director, { markdown: "No sections here.", source: "manual", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "no-sections" });
    expect(await savePhilosophy(director, { markdown: `${PHILOSOPHY}\n\n## Purpose\n\nAgain.`, source: "manual", baseRevisionId: 1 }, deps)).toEqual({
      ok: false,
      problem: "duplicate-section",
    });
    expect(await savePhilosophy(director, { markdown: PHILOSOPHY, source: "manual", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "unchanged" });
    expect(revisions).toHaveLength(1);
  });

  it("says so when there is nowhere to keep the philosophy", async () => {
    const { deps } = philosophyStore(null);
    expect(await savePhilosophy(director, { markdown: edited, source: "manual", baseRevisionId: 1 }, deps)).toEqual({ ok: false, problem: "unavailable" });
  });

  it("restores an earlier version as a NEW version, keeping everything in between", async () => {
    const { deps, revisions } = philosophyStore();
    await savePhilosophy(director, { markdown: edited, source: "manual", baseRevisionId: 1 }, deps);
    const restored = await restorePhilosophy(director, { revisionId: 1, baseRevisionId: 2 }, deps);
    expect(restored).toMatchObject({ ok: true, revision: { id: 3, source: "restore", restoredFrom: 1, changedSections: ["Recent Usage"] } });
    expect(revisions.map((revision) => revision.source)).toEqual(["seed", "manual", "restore"]);
    expect(revisions[2].markdown).toBe(revisions[0].markdown);
    expect(revisions[1].markdown).toContain("secondary to familiarity");
    // Restoring what is already in force, or a version that never was, does nothing.
    expect(await restorePhilosophy(director, { revisionId: 3, baseRevisionId: 3 }, deps)).toEqual({ ok: false, problem: "unchanged" });
    expect(await restorePhilosophy(director, { revisionId: 99, baseRevisionId: 3 }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(revisions).toHaveLength(3);
  });

  it("is what the planner is given once it is applied: the version in force, word for word", async () => {
    const { deps } = philosophyStore();
    const before = (await deps.current())!.markdown;
    expect(plannerInstructions(before)).toContain("Do not repeat a song within a month.");
    await savePhilosophy(director, { markdown: edited, source: "manual", baseRevisionId: 1 }, deps);
    const instructions = plannerInstructions((await deps.current())!.markdown);
    expect(instructions).toContain("Recent usage is considered, but is secondary to familiarity.");
    expect(instructions).not.toContain("Do not repeat a song within a month.");
    expect(instructions.endsWith((await deps.current())!.markdown)).toBe(true);
  });
});
