import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ClerkEnv } from "@/lib/auth/clerk-env";

import { parsePlanningPhilosophy, type PlanningPhilosophy } from "./philosophy";
import type { PhilosophyRevision } from "./revisions";
import { latestPhilosophyRevision, philosophyStoreConfigured, seedPhilosophyRevision } from "./store";

/**
 * Reads the Service Planning Philosophy: the ONE place any AI feature gets
 * it. Conductor reads it through its get_planning_philosophy tool; Generate
 * with AI and Suggest with AI put `markdown` in their instructions. None keeps
 * a copy of its own.
 *
 * WHERE IT LIVES. The database: the latest row of
 * planning_philosophy_revisions (store.ts) is the philosophy in force, edited
 * under Admin -> AI -> Planning philosophy with no deploy.
 *
 * The document in the repository (PHILOSOPHY_PATH) is only where that begins:
 * the first time an environment is asked for its philosophy and has none, the
 * document is copied in as its first version. From then on the document is
 * not read again there - editing it changes nothing at runtime - so there are
 * never two sources to keep in step. It is also what a deployment with no
 * database at all falls back to.
 *
 * Never throws: an unreadable philosophy is `ok: false`, and whoever asked
 * says it is not available rather than making one up.
 */
export const PHILOSOPHY_PATH = "src/content/music-planning-philosophy.md";

export type LoadedPhilosophy =
  /** `revisionId` is null only when it came from the repository's document (no database here). */
  { ok: true; philosophy: PlanningPhilosophy; revisionId: number | null } | { ok: false };

let seedDocument: Promise<string | null> | null = null;

/** The repository's document, read from disk once per server (every time in development). */
function readSeedDocument(): Promise<string | null> {
  const read = async () => {
    try {
      return await readFile(join(process.cwd(), PHILOSOPHY_PATH), "utf8");
    } catch (error) {
      console.error("[ai] The planning philosophy document could not be read:", error instanceof Error ? error.message : "unknown error");
      return null;
    }
  };
  if (process.env.NODE_ENV !== "production") return read();
  seedDocument ??= read().then((text) => {
    // A failure is not kept: the next request tries again.
    if (text === null) seedDocument = null;
    return text;
  });
  return seedDocument;
}

/**
 * The version in force for this environment, the first copy being taken from
 * the repository's document if there is none yet. Null when there is no
 * database, or no usable document to begin from.
 */
export async function currentPhilosophyRevision(env: ClerkEnv): Promise<PhilosophyRevision | null> {
  if (!philosophyStoreConfigured()) return null;
  const latest = await latestPhilosophyRevision(env);
  if (latest) return latest;

  const document = await readSeedDocument();
  if (document === null) return null;
  const parsed = parsePlanningPhilosophy(document);
  if (!parsed.ok) {
    console.error(`[ai] The planning philosophy document could not be used (${parsed.problem}): ${PHILOSOPHY_PATH}`);
    return null;
  }
  await seedPhilosophyRevision(env, parsed.philosophy.markdown);
  return latestPhilosophyRevision(env);
}

/** The repository's document as the philosophy: only for a deployment whose database cannot be reached. */
async function fromDocument(): Promise<LoadedPhilosophy> {
  const document = await readSeedDocument();
  if (document === null) return { ok: false };
  const parsed = parsePlanningPhilosophy(document);
  if (parsed.ok) return { ok: true, philosophy: parsed.philosophy, revisionId: null };
  console.error(`[ai] The planning philosophy document could not be used (${parsed.problem}): ${PHILOSOPHY_PATH}`);
  return { ok: false };
}

export async function loadPlanningPhilosophy(env: ClerkEnv): Promise<LoadedPhilosophy> {
  if (!philosophyStoreConfigured()) return fromDocument();

  let revision: PhilosophyRevision | null;
  try {
    revision = await currentPhilosophyRevision(env);
  } catch (error) {
    // The database is there but did not answer: say so, rather than quietly planning by an older document.
    console.error("[ai] The planning philosophy could not be read:", error instanceof Error ? error.message : "unknown error");
    return { ok: false };
  }
  if (!revision) return { ok: false };

  const parsed = parsePlanningPhilosophy(revision.markdown);
  if (parsed.ok) return { ok: true, philosophy: parsed.philosophy, revisionId: revision.id };
  // Every version is checked before it is stored, so this is a version stored under older rules.
  console.error(`[ai] The stored planning philosophy could not be used (${parsed.problem}): revision ${revision.id}`);
  return { ok: false };
}
