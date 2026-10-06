import type { Permission } from "@/lib/auth/permissions";

import { canWriteMemory, createMemory, deleteMemory, updateMemory, type MemoryDeps, type MemoryProblem } from "../memory/service";
import { parsePlanningPhilosophy } from "../planning/philosophy";
import { replaceSection } from "../planning/revisions";
import { savePhilosophy, type PhilosophyChangeProblem, type PhilosophyDeps } from "../planning/service";
import { choicesFor, type ConductorAction, type ConductorActionChoice, type ConductorActionResult } from "./actions";

/**
 * Settling something Conductor proposed: the person has chosen on its card.
 * THIS is where a memory is saved or the philosophy changed on Conductor's
 * suggestion - never in a tool, and never because the model said so.
 *
 *   1. The proposal must be this person's, and still waiting. A proposal is
 *      settled once: it is claimed before anything is written, so two clicks
 *      or two tabs cannot apply it twice.
 *   2. The person's permissions are checked now, for the choice they made -
 *      whatever they were when the card was shown. A refused choice changes
 *      nothing and leaves the card waiting; saving to one scope is never
 *      turned into saving to the other.
 *   3. The write itself is the same function the Memory page and the
 *      philosophy editor use (memory/service.ts, planning/service.ts), so a
 *      proposal cannot do anything a person could not do by hand.
 *   4. Cancel writes nothing.
 *
 * Its reads and writes come in as `deps`, so all of this is unit tested
 * without a database (actions.test.ts).
 */

export interface ResolveActor {
  userId: string;
  can(permission: Permission): boolean;
}

export interface ResolveDeps {
  /** One of this person's proposals; null for any other id. */
  get(id: string): Promise<ConductorAction | null>;
  /** Settles it if it is still waiting; null when it no longer is. */
  claim(id: string, status: "applied" | "cancelled", result: ConductorActionResult | null): Promise<ConductorAction | null>;
  /** Puts it back to waiting, when applying it failed. */
  release(id: string): Promise<void>;
  memory: MemoryDeps;
  philosophy: PhilosophyDeps;
}

export type ResolveProblem =
  | "not-found"
  /** Already applied or cancelled. */
  | "settled"
  | "invalid-choice"
  | "forbidden"
  /** The memory it was about has gone, or is no longer this person's to change. */
  | "memory-gone"
  | "memory-invalid"
  | "memory-full"
  /** The philosophy has changed since the proposal was made. */
  | "philosophy-changed"
  | "philosophy-invalid"
  | "unavailable";

export type ResolveResult = { ok: true; action: ConductorAction } | { ok: false; problem: ResolveProblem };

const no = (problem: ResolveProblem): ResolveResult => ({ ok: false, problem });

const MEMORY_PROBLEMS: Record<MemoryProblem, ResolveProblem> = {
  forbidden: "forbidden",
  invalid: "memory-invalid",
  "not-found": "memory-gone",
  full: "memory-full",
  // The memory already reads as proposed: there was nothing left to do.
  unchanged: "memory-gone",
};

const philosophyProblem = (problem: PhilosophyChangeProblem): ResolveProblem =>
  problem === "forbidden" ? "forbidden" : problem === "unavailable" ? "unavailable" : problem === "conflict" || problem === "unchanged" || problem === "not-found" ? "philosophy-changed" : "philosophy-invalid";

/** Whether the person may make this choice, as far as their permissions go. */
function permitted(actor: ResolveActor, action: ConductorAction, choice: ConductorActionChoice): boolean {
  switch (action.kind) {
    case "memory_save":
      return choice === "personal" || choice === "global" ? canWriteMemory(actor, choice) : false;
    case "memory_update":
    case "memory_delete":
      return canWriteMemory(actor, action.payload.scope);
    case "philosophy_edit":
      return actor.can("manage_planning_philosophy");
  }
}

/** Does what the proposal proposed, through the same rules as doing it by hand. Null when it worked. */
async function carryOut(actor: ResolveActor, action: ConductorAction, choice: ConductorActionChoice, deps: ResolveDeps): Promise<ResolveProblem | null> {
  switch (action.kind) {
    case "memory_save": {
      if (choice !== "personal" && choice !== "global") return "invalid-choice";
      const saved = await createMemory(actor, { scope: choice, text: action.payload.text }, deps.memory);
      return saved.ok ? null : MEMORY_PROBLEMS[saved.problem];
    }
    case "memory_update": {
      const changed = await updateMemory(actor, { id: action.payload.memoryId, text: action.payload.after }, deps.memory);
      return changed.ok ? null : MEMORY_PROBLEMS[changed.problem];
    }
    case "memory_delete": {
      const removed = await deleteMemory(actor, action.payload.memoryId, deps.memory);
      return removed.ok ? null : MEMORY_PROBLEMS[removed.problem];
    }
    case "philosophy_edit": {
      const current = await deps.philosophy.current();
      if (!current) return "unavailable";
      // Proposed against a version that is no longer the one in force: the person would be approving a change to text they have not seen.
      if (action.payload.baseRevisionId !== current.id) return "philosophy-changed";
      const parsed = parsePlanningPhilosophy(current.markdown);
      if (!parsed.ok) return "unavailable";
      const markdown = replaceSection(parsed.philosophy, action.payload.sectionId, action.payload.after);
      if (markdown === null) return "philosophy-changed";
      const saved = await savePhilosophy(actor, { markdown, source: "ai", note: action.payload.explanation, baseRevisionId: current.id }, deps.philosophy);
      return saved.ok ? null : philosophyProblem(saved.problem);
    }
  }
}

export async function resolveAction(actor: ResolveActor, id: string, choice: ConductorActionChoice, deps: ResolveDeps): Promise<ResolveResult> {
  if (!actor.can("use_ai")) return no("forbidden");

  const action = await deps.get(id);
  if (!action) return no("not-found");
  if (action.status !== "pending") return no("settled");
  if (!choicesFor(action.kind).includes(choice)) return no("invalid-choice");

  if (choice === "cancel") {
    const cancelled = await deps.claim(id, "cancelled", null);
    return cancelled ? { ok: true, action: cancelled } : no("settled");
  }

  // Before it is claimed: a choice this person may not make leaves the card as it was.
  if (!permitted(actor, action, choice)) return no("forbidden");

  const claimed = await deps.claim(id, "applied", action.kind === "memory_save" && (choice === "personal" || choice === "global") ? { scope: choice } : null);
  if (!claimed) return no("settled");

  let problem: ResolveProblem | null;
  try {
    problem = await carryOut(actor, action, choice, deps);
  } catch (error) {
    await deps.release(id);
    throw error;
  }
  if (problem) {
    await deps.release(id);
    return no(problem);
  }
  return { ok: true, action: claimed };
}
