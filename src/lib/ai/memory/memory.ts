/**
 * AI memory: what a person has explicitly asked the AI to remember. Pure -
 * no server-only import - so the pages, the forms and the tests share it.
 *
 * Every memory has a SCOPE, and the two are never mixed up:
 *
 *   personal   belongs to one person, and is used only when the AI is helping
 *              that person ("I like hymn 95 as an opener")
 *   global     shared by the ministry, and used for everyone who may use the
 *              AI ("The congregation knows hymn 95 very well")
 *
 * A memory is context for the AI to weigh - never a rule. It ranks below the
 * site's own safeguards, the planning philosophy and what a person asks for in
 * the request at hand (src/lib/ai/context/authority.ts).
 *
 * NOTHING HERE IS WRITTEN BY THE AI. A memory is saved when a person types it
 * under Admin -> AI -> Memory, or approves a card Conductor showed them after
 * they asked it to remember something. See AI.md, "Memory".
 */

export type MemoryScope = "personal" | "global";

export const MEMORY_SCOPES: readonly MemoryScope[] = ["personal", "global"];

export function isMemoryScope(value: unknown): value is MemoryScope {
  return value === "personal" || value === "global";
}

export interface Memory {
  id: number;
  scope: MemoryScope;
  /** Whose it is, for a personal memory; null for a global one. */
  ownerUserId: string | null;
  text: string;
  /** A loose label for finding it again. The text is what counts. */
  category: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MEMORY_LIMITS = {
  /** One memory: a sentence or two. */
  textChars: 500,
  categoryChars: 40,
  /** How much of each scope goes into one AI request. */
  contextChars: 3000,
  /** Memories listed for the AI by list_memories. */
  listed: 40,
  /** Memories of one scope a person may keep. */
  perScope: 300,
} as const;

/** Offered when a memory is filed; any other label may be typed. */
export const MEMORY_CATEGORIES = ["Service planning", "Songs", "Musicians", "Ministry", "Equipment", "Preferences", "General"] as const;

/** A memory's text as it is stored: one tidy line or paragraph. Null when there is nothing to store, or too much. */
export function normalizeMemoryText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text === "" || text.length > MEMORY_LIMITS.textChars ? null : text;
}

/** A category as it is stored: null for none. `undefined` when it is not one at all. */
export function normalizeMemoryCategory(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > MEMORY_LIMITS.categoryChars ? undefined : text;
}

/** Words that say nothing about what a memory is about. */
const SMALL_WORDS = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "that", "is", "are", "we", "i", "our", "my", "it", "this", "with", "as", "at", "be"]);

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !SMALL_WORDS.has(word));

/** How many of the request's words a memory shares. */
function overlap(memory: Memory, asked: ReadonlySet<string>): number {
  if (asked.size === 0) return 0;
  return new Set(words(`${memory.text} ${memory.category ?? ""}`).filter((word) => asked.has(word))).size;
}

/**
 * The memories that go into one AI request. All of them while they fit in
 * `maxChars`; past that, the ones that share most words with what is being
 * asked, then the most recently changed. Returned newest first.
 *
 * This is the one place retrieval is decided, so a larger memory can later be
 * searched by meaning without any feature changing how it asks.
 */
export function selectMemories(memories: readonly Memory[], options: { query?: string; maxChars?: number } = {}): Memory[] {
  const maxChars = options.maxChars ?? MEMORY_LIMITS.contextChars;
  const newestFirst = [...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
  if (newestFirst.reduce((total, memory) => total + memory.text.length, 0) <= maxChars) return newestFirst;

  const asked = new Set(words(options.query ?? ""));
  // A stable sort: among memories equally near the request, the newest stay first.
  const ranked = [...newestFirst].sort((a, b) => overlap(b, asked) - overlap(a, asked));
  const kept = new Set<number>();
  let length = 0;
  for (const memory of ranked) {
    if (length + memory.text.length > maxChars) continue;
    kept.add(memory.id);
    length += memory.text.length;
  }
  return newestFirst.filter((memory) => kept.has(memory.id));
}

/** Memories matching what was typed in a search box, or asked of Conductor: every word, anywhere in the text or category. */
export function searchMemories<T extends Pick<Memory, "text" | "category">>(memories: readonly T[], query: string): T[] {
  const asked = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (asked.length === 0) return [...memories];
  return memories.filter((memory) => {
    const text = `${memory.text} ${memory.category ?? ""}`.toLowerCase();
    return asked.every((word) => text.includes(word));
  });
}

/** What an AI request is given of memory: each scope apart, already chosen and bounded. */
export interface MemoryContext {
  global: Memory[];
  personal: Memory[];
}

export const NO_MEMORY: MemoryContext = { global: [], personal: [] };

const lines = (memories: readonly Memory[]) => memories.map((memory) => `- ${memory.text}`).join("\n");

/**
 * Memory as the model reads it: the two scopes under their own headings, so
 * it always knows whose a memory is. Null when there is none to give.
 */
export function renderMemories(memory: MemoryContext): string | null {
  const parts = [
    memory.global.length > 0 ? `Global memory (shared by the whole ministry):\n${lines(memory.global)}` : null,
    memory.personal.length > 0 ? `Personal memory (saved by the person you are helping, for themselves only):\n${lines(memory.personal)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
