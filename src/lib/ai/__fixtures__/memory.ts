import type { Permission } from "@/lib/auth/permissions";

import type { Memory, MemoryScope } from "../memory/memory";
import type { MemoryActor, MemoryDeps } from "../memory/service";

/**
 * For the tests: a memory kept in a list, behind the same doors the database
 * gives (src/lib/ai/memory/store.ts) - a row is reached as a person, and a
 * personal row only by its owner. `writes` records every change made.
 */
export function memoryStore(initial: Memory[] = []) {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((row) => row.id)) + 1;
  let clock = Date.parse("2026-10-05T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const visible = (userId: string, row: Memory) => row.scope === "global" || row.ownerUserId === userId;
  const writes: string[] = [];

  const deps: MemoryDeps = {
    listGlobal: async () => rows.filter((row) => row.scope === "global"),
    listPersonal: async (userId) => rows.filter((row) => row.scope === "personal" && row.ownerUserId === userId),
    get: async (userId, id) => rows.find((row) => row.id === id && visible(userId, row)) ?? null,
    count: async (scope, userId) => rows.filter((row) => row.scope === scope && (scope === "global" || row.ownerUserId === userId)).length,
    insert: async (write) => {
      const at = tick();
      const row: Memory = {
        id: nextId++,
        scope: write.scope,
        ownerUserId: write.ownerUserId,
        text: write.text,
        category: write.category,
        createdBy: write.userId,
        updatedBy: write.userId,
        createdAt: at,
        updatedAt: at,
      };
      rows.push(row);
      writes.push(`insert:${row.scope}`);
      return row;
    },
    update: async (id, write) => {
      const row = rows.find((item) => item.id === id && visible(write.userId, item));
      if (!row) return null;
      Object.assign(row, { text: write.text, category: write.category, updatedBy: write.userId, updatedAt: tick() });
      writes.push("update");
      return row;
    },
    move: async (id, write) => {
      const row = rows.find((item) => item.id === id && visible(write.userId, item));
      if (!row) return null;
      Object.assign(row, { scope: write.scope, ownerUserId: write.ownerUserId, updatedBy: write.userId, updatedAt: tick() });
      writes.push(`move:${write.scope}`);
      return row;
    },
    remove: async (userId, id) => {
      const index = rows.findIndex((item) => item.id === id && visible(userId, item));
      if (index < 0) return false;
      rows.splice(index, 1);
      writes.push("remove");
      return true;
    },
  };
  return { deps, rows, writes };
}

export const actor = (userId: string, ...permissions: Permission[]): MemoryActor => ({ userId, can: (permission) => permissions.includes(permission) });

/** The Music Director: every AI permission. */
export const director = actor("user_director", "use_ai", "use_personal_ai_memory", "manage_global_ai_memory", "manage_planning_philosophy");
/** A musician given AI later: their own memory, never the ministry's. */
export const musician = actor("user_musician", "use_ai", "use_personal_ai_memory");
/** Someone who may only use AI. */
export const plain = actor("user_plain", "use_ai");

export const memory = (id: number, scope: MemoryScope, text: string, owner: string | null = null, updatedAt = "2026-10-01T00:00:00.000Z"): Memory => ({
  id,
  scope,
  ownerUserId: scope === "personal" ? (owner ?? "user_director") : null,
  text,
  category: null,
  createdBy: owner ?? "user_director",
  updatedBy: owner ?? "user_director",
  createdAt: updatedAt,
  updatedAt,
});
