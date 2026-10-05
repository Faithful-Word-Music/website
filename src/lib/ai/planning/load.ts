import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parsePlanningPhilosophy, type PlanningPhilosophy } from "./philosophy";

/**
 * Reads the Music Director's planning philosophy from the repository: the ONE
 * place any AI feature gets it. Conductor reads it through its
 * get_planning_philosophy tool; a plan generator will put `markdown` in its
 * own prompt. Neither keeps a copy of its own.
 *
 * The document ships with the deployment (next.config.ts lists it for each
 * route that reads it), so it is read from disk once and kept for the life of
 * the server. In development it is read every time, so an edit shows at once.
 *
 * Never throws: a missing or unreadable document is `ok: false`, and whoever
 * asked says the philosophy is not available rather than making one up.
 */
export const PHILOSOPHY_PATH = "src/content/music-planning-philosophy.md";

export type LoadedPhilosophy = { ok: true; philosophy: PlanningPhilosophy } | { ok: false };

async function read(): Promise<LoadedPhilosophy> {
  try {
    const parsed = parsePlanningPhilosophy(await readFile(join(process.cwd(), PHILOSOPHY_PATH), "utf8"));
    if (parsed.ok) return parsed;
    console.error(`[ai] The planning philosophy could not be used (${parsed.problem}): ${PHILOSOPHY_PATH}`);
  } catch (error) {
    console.error("[ai] The planning philosophy could not be read:", error instanceof Error ? error.message : "unknown error");
  }
  return { ok: false };
}

let kept: Promise<LoadedPhilosophy> | null = null;

export function loadPlanningPhilosophy(): Promise<LoadedPhilosophy> {
  if (process.env.NODE_ENV !== "production") return read();
  kept ??= read().then((loaded) => {
    // A failure is not kept: the next question tries again.
    if (!loaded.ok) kept = null;
    return loaded;
  });
  return kept;
}
