/**
 * Conductor's bounds: how much a person may send, how much of a conversation
 * goes back to the model, how far one answer may run. AI Gateway's budget is
 * what stops spending; these keep any single question small. See AI.md.
 *
 * Pure - no server-only import - so the browser shares the same limits and
 * they can be unit tested.
 */
export const CONDUCTOR_LIMITS = {
  /** Longest question, in characters. */
  questionChars: 2000,
  /** Turns of the conversation sent back with a question, the question included. */
  historyTurns: 12,
  /** ...and their total length. */
  historyChars: 12_000,
  /** An earlier answer longer than this is sent back cut short. */
  answerChars: 4000,
  /** Model calls for one question: each round of tool use is one, and the answer is one. */
  steps: 6,
  outputTokens: 1500,
  /** Longest tool result, as JSON characters. */
  toolResultChars: 6000,
  toolMs: 10_000,
  /** Questions one person may ask in an hour. */
  perHour: 40,
  /** Turns kept in the browser's copy of the conversation. */
  storedTurns: 60,
} as const;

export interface ConductorTurn {
  role: "user" | "assistant";
  text: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The part of a conversation that goes to the model: the latest turns, within
 * a number of turns and a total length, starting with something the person
 * said and ending with their question. Empty when there is no question to
 * answer. Only text travels - never an earlier tool result - so a fact is
 * looked up again rather than trusted from memory.
 */
export function trimConversation(turns: readonly ConductorTurn[]): ConductorTurn[] {
  const { questionChars, answerChars, historyTurns, historyChars } = CONDUCTOR_LIMITS;
  const clean = turns
    .map((turn) => ({ role: turn.role, text: turn.text.trim() }))
    .filter((turn) => turn.text !== "")
    .map((turn) => ({ role: turn.role, text: clip(turn.text, turn.role === "user" ? questionChars : answerChars) }));
  if (clean.at(-1)?.role !== "user") return [];

  const kept: ConductorTurn[] = [];
  let length = 0;
  for (let index = clean.length - 1; index >= 0 && kept.length < historyTurns; index -= 1) {
    const turn = clean[index];
    // The question itself always goes, whatever its length.
    if (kept.length > 0 && length + turn.text.length > historyChars) break;
    kept.unshift(turn);
    length += turn.text.length;
  }
  while (kept[0]?.role === "assistant") kept.shift();
  return kept;
}

/**
 * A tool's result, kept within toolResultChars: while it is too long, its
 * longest list is halved and the result marked `truncated`, so the model
 * knows it is looking at part of the answer and can ask more narrowly.
 */
export function clampToolResult<T extends Record<string, unknown>>(result: T, maxChars: number = CONDUCTOR_LIMITS.toolResultChars): T {
  let current: Record<string, unknown> = result;
  for (let pass = 0; pass < 12 && JSON.stringify(current).length > maxChars; pass += 1) {
    const longest = Object.entries(current)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]) && entry[1].length > 1)
      .sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length)[0];
    if (!longest) break;
    const [key, list] = longest;
    current = { ...current, [key]: list.slice(0, Math.ceil(list.length / 2)), truncated: true };
  }
  if (JSON.stringify(current).length > maxChars) {
    return { truncated: true, note: "The result was too large to return. Ask for a narrower range." } as unknown as T;
  }
  return current as T;
}
