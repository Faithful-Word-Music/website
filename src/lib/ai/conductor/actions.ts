import { z } from "zod";

import { MEMORY_LIMITS, type MemoryScope } from "../memory/memory";

/**
 * What Conductor may PROPOSE, and never do: saving, changing or forgetting a
 * memory, and changing a section of the planning philosophy. Pure - shared by
 * the server, the page and the tests.
 *
 * A tool that wants one of these writes nothing but a proposal (a row of
 * conductor_actions, status "pending"). The conversation shows it as a card
 * with exactly what would be saved, and only the person's own choice on that
 * card - checked again on the server, with their permissions - applies it
 * (resolve.ts). Cancel stores nothing. A proposal is settled once.
 */

export const ACTION_KINDS = ["memory_save", "memory_update", "memory_delete", "philosophy_edit"] as const;
export type ConductorActionKind = (typeof ACTION_KINDS)[number];

export type ConductorActionStatus = "pending" | "applied" | "cancelled";

const scope = z.enum(["personal", "global"]);
const memoryText = z.string().min(1).max(MEMORY_LIMITS.textChars);

const PAYLOADS = {
  /** A new memory: the exact text, and the scope the person seemed to ask for, if they said. */
  memory_save: z.object({ text: memoryText, suggestedScope: scope.nullable() }),
  memory_update: z.object({ memoryId: z.number().int(), scope, before: z.string(), after: memoryText }),
  memory_delete: z.object({ memoryId: z.number().int(), scope, text: z.string() }),
  /** One section's text, as it stood when proposed and as it would read, on the version it was proposed against. */
  philosophy_edit: z.object({
    sectionId: z.string().min(1),
    sectionTitle: z.string().min(1),
    before: z.string(),
    after: z.string().min(1),
    explanation: z.string().max(600),
    baseRevisionId: z.number().int().nullable(),
  }),
} as const;

export type ConductorActionPayloads = { [K in ConductorActionKind]: z.infer<(typeof PAYLOADS)[K]> };

/** What settling a proposal left behind, for the card to say. */
export interface ConductorActionResult {
  /** For a memory that was saved: where. */
  scope?: MemoryScope;
}

export type ConductorAction = {
  [K in ConductorActionKind]: {
    id: string;
    kind: K;
    status: ConductorActionStatus;
    payload: ConductorActionPayloads[K];
    result: ConductorActionResult | null;
  };
}[ConductorActionKind];

/** A proposal read back from storage or from the stream: null unless it is exactly one of the shapes above. */
export function parseConductorAction(value: unknown): ConductorAction | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.kind !== "string" || !ACTION_KINDS.includes(item.kind as ConductorActionKind)) return null;
  if (item.status !== "pending" && item.status !== "applied" && item.status !== "cancelled") return null;
  const kind = item.kind as ConductorActionKind;
  const payload = PAYLOADS[kind].safeParse(item.payload);
  if (!payload.success) return null;
  const result = item.result && typeof item.result === "object" ? (item.result as { scope?: unknown }) : null;
  return {
    id: item.id,
    kind,
    status: item.status,
    payload: payload.data,
    result: result ? { ...(result.scope === "personal" || result.scope === "global" ? { scope: result.scope } : {}) } : null,
  } as ConductorAction;
}

/** What the person may choose on a card. A new memory is always a choice of scope; the rest are yes or no. */
export type ConductorActionChoice = "personal" | "global" | "apply" | "cancel";

export function isActionChoice(value: unknown): value is ConductorActionChoice {
  return value === "personal" || value === "global" || value === "apply" || value === "cancel";
}

/** The choices that mean something for a kind of proposal. */
export function choicesFor(kind: ConductorActionKind): ConductorActionChoice[] {
  return kind === "memory_save" ? ["personal", "global", "cancel"] : ["apply", "cancel"];
}

const SCOPE_WORDS: Record<MemoryScope, string> = { personal: "personal memory", global: "global memory" };

/**
 * A proposal as one line of the conversation the model is sent back: what was
 * put to the person and what they decided. This is how Conductor knows, on
 * the next question, whether something was really saved - it is never told so
 * by its own earlier words.
 */
export function describeAction(action: ConductorAction): string {
  const outcome =
    action.status === "pending"
      ? "The person has not decided yet; nothing has been saved."
      : action.status === "cancelled"
        ? "The person cancelled it; nothing was saved."
        : null;

  switch (action.kind) {
    case "memory_save":
      return `[A card asked the person whether to save this memory: "${action.payload.text}". ${
        outcome ?? `They saved it to ${SCOPE_WORDS[action.result?.scope ?? "personal"]}.`
      }]`;
    case "memory_update":
      return `[A card asked the person whether to change a memory in ${SCOPE_WORDS[action.payload.scope]} to: "${action.payload.after}". ${
        outcome ?? "They applied the change."
      }]`;
    case "memory_delete":
      return `[A card asked the person whether to forget this memory from ${SCOPE_WORDS[action.payload.scope]}: "${action.payload.text}". ${
        outcome ?? "They deleted it."
      }]`;
    case "philosophy_edit":
      return `[A card asked the person whether to change the planning philosophy's section "${action.payload.sectionTitle}". ${
        outcome ?? "They applied the change: the philosophy now reads as proposed."
      }]`;
  }
}

/** Proposals one answer may make. */
export const ACTIONS_PER_ANSWER = 3;

/** The name of the stream event that carries a proposal to the page (src/lib/ai/stream.ts, "data"). */
export const ACTION_EVENT = "action";
/** ...and of the one that says which saved conversation the answer belongs to. */
export const CONVERSATION_EVENT = "conversation";
