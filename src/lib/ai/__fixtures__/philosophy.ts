import type { PhilosophyRevision } from "../planning/revisions";
import type { PhilosophyDeps } from "../planning/service";

/** A small philosophy, in the document's own form. */
export const PHILOSOPHY = `# Service Planning Philosophy

## Purpose

The congregation should sing out.

---

## Recent Usage

Do not repeat a song within a month.

---

## Christmas Season

Every service in the season must use only Christmas songs. This is a hard rule.`;

/**
 * For the tests: the philosophy's versions kept in a list, with the one rule
 * the database enforces (src/lib/ai/planning/store.ts) - a version is added
 * only on top of the latest.
 */
export function philosophyStore(markdown: string | null = PHILOSOPHY) {
  const revisions: PhilosophyRevision[] = [];
  let clock = Date.parse("2026-10-05T12:00:00.000Z");
  const add = (revision: Omit<PhilosophyRevision, "id" | "at">) => {
    const stored = { ...revision, id: revisions.length + 1, at: new Date((clock += 60_000)).toISOString() };
    revisions.push(stored);
    return stored;
  };
  if (markdown !== null) add({ by: null, source: "seed", restoredFrom: null, changedSections: [], note: null, markdown });

  const deps: PhilosophyDeps = {
    current: async () => revisions.at(-1) ?? null,
    get: async (id) => revisions.find((revision) => revision.id === id) ?? null,
    append: async (write) => {
      if (revisions.at(-1)?.id !== write.baseRevisionId) return null;
      return add({
        by: write.userId,
        source: write.source,
        restoredFrom: write.restoredFrom,
        changedSections: write.changedSections,
        note: write.note,
        markdown: write.markdown,
      });
    },
  };
  return { deps, revisions };
}
