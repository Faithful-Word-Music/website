import type { Permission } from "@/lib/auth/permissions";

import {
  MEMORY_LIMITS,
  NO_MEMORY,
  normalizeMemoryCategory,
  normalizeMemoryText,
  selectMemories,
  type Memory,
  type MemoryContext,
  type MemoryScope,
} from "./memory";

/**
 * Who may do what with AI memory: the ONE set of rules, used by the Memory
 * page, by the cards Conductor shows, and by what every AI request is given.
 *
 *   use_ai                    needed for all of it
 *   use_personal_ai_memory    keep, change and delete your OWN memories, and
 *                             have the AI use them for you
 *   manage_global_ai_memory   add, change and delete the shared memories
 *
 * The two memory permissions are separate: someone may hold either, both or
 * neither. Shared memory is READ by the AI for everyone who may use AI - it is
 * the ministry's knowledge - while changing it takes its permission. Moving a
 * memory between the scopes takes both.
 *
 * A personal memory is reachable only by its owner: the store never returns
 * another person's, whatever id is asked for, so "not found" is all anyone
 * else can learn. A save refused for one scope is refused - it is never
 * quietly made in the other.
 *
 * What it needs from the server comes in as `deps`, so every rule is unit
 * tested without a database (memory.test.ts). store.ts supplies the real ones.
 */

export interface MemoryActor {
  userId: string;
  can(permission: Permission): boolean;
}

export interface MemoryDeps {
  /** The shared memories. */
  listGlobal(): Promise<Memory[]>;
  /** One person's own memories. */
  listPersonal(userId: string): Promise<Memory[]>;
  /** A memory this person can see: a shared one, or one of their own. Never anyone else's. */
  get(userId: string, id: number): Promise<Memory | null>;
  count(scope: MemoryScope, userId: string): Promise<number>;
  insert(write: { scope: MemoryScope; ownerUserId: string | null; text: string; category: string | null; userId: string }): Promise<Memory>;
  update(id: number, write: { text: string; category: string | null; userId: string }): Promise<Memory | null>;
  move(id: number, write: { scope: MemoryScope; ownerUserId: string | null; userId: string }): Promise<Memory | null>;
  remove(userId: string, id: number): Promise<boolean>;
}

export type MemoryProblem = "forbidden" | "invalid" | "not-found" | "full" | "unchanged";
export type MemoryResult = { ok: true; memory: Memory } | { ok: false; problem: MemoryProblem };

const no = (problem: MemoryProblem): MemoryResult => ({ ok: false, problem });

/** Whether this person's own memories exist for them at all. */
export function canUsePersonalMemory(actor: MemoryActor): boolean {
  return actor.can("use_ai") && actor.can("use_personal_ai_memory");
}

/** Whether this person may change the shared memories. */
export function canManageGlobalMemory(actor: MemoryActor): boolean {
  return actor.can("use_ai") && actor.can("manage_global_ai_memory");
}

/** Whether this person may save, change or delete a memory of this scope. */
export function canWriteMemory(actor: MemoryActor, scope: MemoryScope): boolean {
  return scope === "personal" ? canUsePersonalMemory(actor) : canManageGlobalMemory(actor);
}

/** The scopes this person may save into: what a confirmation card offers. */
export function writableScopes(actor: MemoryActor): MemoryScope[] {
  return (["personal", "global"] as const).filter((scope) => canWriteMemory(actor, scope));
}

/** Everything this person may see: the shared memories, and their own when they have personal memory. */
export async function listMemories(actor: MemoryActor, deps: MemoryDeps): Promise<MemoryContext> {
  if (!actor.can("use_ai")) return NO_MEMORY;
  const [global, personal] = await Promise.all([deps.listGlobal(), canUsePersonalMemory(actor) ? deps.listPersonal(actor.userId) : []]);
  return { global, personal };
}

/**
 * What one AI request is given of memory: the shared memories, and the
 * person's own - chosen and bounded per scope, so neither crowds out the
 * other. `query` is what is being asked, for when there is more than fits.
 */
export async function memoryForRequest(actor: MemoryActor, deps: MemoryDeps, query = ""): Promise<MemoryContext> {
  const all = await listMemories(actor, deps);
  return { global: selectMemories(all.global, { query }), personal: selectMemories(all.personal, { query }) };
}

export async function createMemory(
  actor: MemoryActor,
  input: { scope: MemoryScope; text: unknown; category?: unknown },
  deps: MemoryDeps,
): Promise<MemoryResult> {
  if (!canWriteMemory(actor, input.scope)) return no("forbidden");
  const text = normalizeMemoryText(input.text);
  const category = normalizeMemoryCategory(input.category);
  if (text === null || category === undefined) return no("invalid");
  if ((await deps.count(input.scope, actor.userId)) >= MEMORY_LIMITS.perScope) return no("full");
  const memory = await deps.insert({
    scope: input.scope,
    ownerUserId: input.scope === "personal" ? actor.userId : null,
    text,
    category,
    userId: actor.userId,
  });
  return { ok: true, memory };
}

/** A memory this person may change, or why not. Someone else's personal memory is simply not found. */
async function writable(actor: MemoryActor, id: number, deps: MemoryDeps): Promise<MemoryResult> {
  if (!actor.can("use_ai")) return no("forbidden");
  const memory = await deps.get(actor.userId, id);
  if (!memory) return no("not-found");
  // Without personal memory a person's own rows are not theirs to see either.
  if (memory.scope === "personal" && !canUsePersonalMemory(actor)) return no("not-found");
  return canWriteMemory(actor, memory.scope) ? { ok: true, memory } : no("forbidden");
}

/** Changes a memory's text (and its category, when one is given). */
export async function updateMemory(
  actor: MemoryActor,
  input: { id: number; text: unknown; category?: unknown },
  deps: MemoryDeps,
): Promise<MemoryResult> {
  const found = await writable(actor, input.id, deps);
  if (!found.ok) return found;
  const text = normalizeMemoryText(input.text);
  const category = input.category === undefined ? found.memory.category : normalizeMemoryCategory(input.category);
  if (text === null || category === undefined) return no("invalid");
  if (text === found.memory.text && category === found.memory.category) return no("unchanged");
  const memory = await deps.update(input.id, { text, category, userId: actor.userId });
  return memory ? { ok: true, memory } : no("not-found");
}

export async function deleteMemory(actor: MemoryActor, id: number, deps: MemoryDeps): Promise<MemoryResult> {
  const found = await writable(actor, id, deps);
  if (!found.ok) return found;
  return (await deps.remove(actor.userId, id)) ? found : no("not-found");
}

/** Moves a memory to the other scope: it must be one this person may change, into a scope they may save into. */
export async function moveMemory(actor: MemoryActor, input: { id: number; scope: MemoryScope }, deps: MemoryDeps): Promise<MemoryResult> {
  const found = await writable(actor, input.id, deps);
  if (!found.ok) return found;
  if (found.memory.scope === input.scope) return no("unchanged");
  if (!canWriteMemory(actor, input.scope)) return no("forbidden");
  if ((await deps.count(input.scope, actor.userId)) >= MEMORY_LIMITS.perScope) return no("full");
  const memory = await deps.move(input.id, {
    scope: input.scope,
    ownerUserId: input.scope === "personal" ? actor.userId : null,
    userId: actor.userId,
  });
  return memory ? { ok: true, memory } : no("not-found");
}
