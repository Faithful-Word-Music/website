import type { Permission } from "@/lib/auth/permissions";

import { parsePlanningPhilosophy, type PhilosophyProblem } from "./philosophy";
import { changedSections, PHILOSOPHY_EDIT_LIMITS, type PhilosophyRevision } from "./revisions";

/**
 * Changing the Service Planning Philosophy: the ONE way a new version is
 * applied, whoever wrote it. A change typed under Admin -> AI, a change
 * Conductor proposed and the person approved, and an earlier version brought
 * back all end here, so they are checked, recorded and versioned alike.
 *
 *   1. Only for someone holding manage_planning_philosophy. Conductor asking
 *      is not a permission: the person who approves must hold it.
 *   2. The new document must be one the AI could read (parsePlanningPhilosophy).
 *      One that could not is refused, never stored.
 *   3. It is applied only on top of the version it was made from. If someone
 *      else has changed the philosophy since, nothing is written.
 *   4. Nothing is replaced: every change is a new version, a restore included.
 *
 * What it needs from the server comes in as `deps`, so every rule above is
 * unit tested without a database (revisions.test.ts). run.ts supplies the
 * real ones.
 */

export interface PhilosophyEditor {
  userId: string;
  can(permission: Permission): boolean;
}

export interface PhilosophyDeps {
  /** The version in force; null when the philosophy cannot be kept here. */
  current(): Promise<PhilosophyRevision | null>;
  get(id: number): Promise<PhilosophyRevision | null>;
  /** Adds a version on top of `baseRevisionId`; null when that is no longer the latest. */
  append(write: {
    markdown: string;
    source: "manual" | "ai" | "restore";
    restoredFrom: number | null;
    changedSections: string[];
    note: string | null;
    userId: string;
    baseRevisionId: number;
  }): Promise<PhilosophyRevision | null>;
}

export type PhilosophyChangeProblem = "forbidden" | "unavailable" | "conflict" | "unchanged" | "not-found" | PhilosophyProblem;

export type PhilosophyChangeResult = { ok: true; revision: PhilosophyRevision } | { ok: false; problem: PhilosophyChangeProblem };

const no = (problem: PhilosophyChangeProblem): PhilosophyChangeResult => ({ ok: false, problem });

const cleanNote = (note: string | null | undefined) => {
  const text = (note ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text.slice(0, PHILOSOPHY_EDIT_LIMITS.noteChars);
};

async function apply(
  editor: PhilosophyEditor,
  deps: PhilosophyDeps,
  input: { markdown: string; source: "manual" | "ai" | "restore"; restoredFrom: number | null; note?: string | null; baseRevisionId: number },
): Promise<PhilosophyChangeResult> {
  if (!editor.can("manage_planning_philosophy")) return no("forbidden");

  const next = parsePlanningPhilosophy(input.markdown);
  if (!next.ok) return no(next.problem);

  const current = await deps.current();
  if (!current) return no("unavailable");
  if (current.id !== input.baseRevisionId) return no("conflict");

  const before = parsePlanningPhilosophy(current.markdown);
  const changes = before.ok ? changedSections(before.philosophy, next.philosophy) : { titles: next.philosophy.sections.map((section) => section.title), reordered: false, titleChanged: false };
  if (before.ok && changes.titles.length === 0 && !changes.reordered && !changes.titleChanged) return no("unchanged");

  const revision = await deps.append({
    markdown: next.philosophy.markdown,
    source: input.source,
    restoredFrom: input.restoredFrom,
    changedSections: changes.titles,
    note: cleanNote(input.note),
    userId: editor.userId,
    baseRevisionId: current.id,
  });
  return revision ? { ok: true, revision } : no("conflict");
}

/** Applies an edited document: typed by hand ("manual"), or proposed by Conductor and approved ("ai"). */
export function savePhilosophy(
  editor: PhilosophyEditor,
  input: { markdown: string; source: "manual" | "ai"; note?: string | null; baseRevisionId: number },
  deps: PhilosophyDeps,
): Promise<PhilosophyChangeResult> {
  return apply(editor, deps, { ...input, restoredFrom: null });
}

/** Brings an earlier version back, as a NEW version on top of the current one. */
export async function restorePhilosophy(
  editor: PhilosophyEditor,
  input: { revisionId: number; baseRevisionId: number },
  deps: PhilosophyDeps,
): Promise<PhilosophyChangeResult> {
  if (!editor.can("manage_planning_philosophy")) return no("forbidden");
  const earlier = await deps.get(input.revisionId);
  if (!earlier) return no("not-found");
  return apply(editor, deps, { markdown: earlier.markdown, source: "restore", restoredFrom: earlier.id, baseRevisionId: input.baseRevisionId });
}
