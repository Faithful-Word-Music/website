import { renderMemories, type MemoryContext } from "../memory/memory";
import type { AiFeature } from "../features";

/**
 * What each AI feature is given to work from, and how much each kind of
 * context counts. Pure - unit tested. See AI.md, "The context layer".
 *
 * The site has several kinds of AI context, and they are NOT one blob:
 *
 *   the site's own rules        permissions, locks, valid song ids, the checks
 *                               on an answer - enforced in code, whatever a
 *                               prompt says
 *   the planning philosophy     the ministry's official guidance, edited under
 *                               Admin -> AI
 *   this request's instruction  what the person asks for this one time
 *   shared memory               what the ministry has asked the AI to remember
 *   personal memory             what this person has asked it to remember
 *   the conversation            Conductor's own, and nobody else's
 *
 * Two things live here so no feature decides them for itself:
 *
 *   CONTEXT_SOURCES   which of those a feature may be given at all. Generate
 *                     with AI and Suggest with AI are never given a
 *                     conversation - what they are handed has no field to
 *                     put one in (PlanStandingContext, service-planner/plan.ts).
 *   the wording       how the model is told to weigh memory against the rest,
 *                     the same in every prompt.
 */

/** How a feature receives the planning philosophy. */
export type PhilosophyDelivery = "tool" | "whole" | "none";

export interface ContextSources {
  /** "tool": read a section at a time, on request. "whole": the document, in the instructions. */
  philosophy: PhilosophyDelivery;
  globalMemory: boolean;
  personalMemory: boolean;
  /** The saved conversation the request belongs to. Only ever Conductor's. */
  conversation: boolean;
}

const NOTHING: ContextSources = { philosophy: "none", globalMemory: false, personalMemory: false, conversation: false };
const PLANNING: ContextSources = { philosophy: "whole", globalMemory: true, personalMemory: true, conversation: false };

export const CONTEXT_SOURCES: Record<AiFeature, ContextSources> = {
  assistant: { philosophy: "tool", globalMemory: true, personalMemory: true, conversation: true },
  generate_service_plan: PLANNING,
  replace_song: PLANNING,
  // Work the AI does for itself: none of a person's context goes into it.
  conductor_summary: NOTHING,
  connection_test: NOTHING,
  library_indexing: NOTHING,
};

/** The memory a feature is given, with anything it should not have taken out. */
export function memoryFor(feature: AiFeature, memory: MemoryContext): MemoryContext {
  const sources = CONTEXT_SOURCES[feature];
  return { global: sources.globalMemory ? memory.global : [], personal: sources.personalMemory ? memory.personal : [] };
}

/**
 * How memory is to be weighed, said the same way to every feature. It is
 * given together with the memories themselves (memoryBlock), and only then:
 * a request with no memory is told nothing about it.
 */
export const MEMORY_AUTHORITY = `These are things people have explicitly asked to be remembered. They are context to weigh, not rules.
- They never outrank the limits of the request, a lock, a hard rule or the planning philosophy. Where a memory disagrees with the philosophy, follow the philosophy and say that the two disagree.
- What the person asks for in this request outranks a memory.
- Global memory is the ministry's; personal memory is only this person's preference. Where the two disagree, global memory stands for the ministry and the personal one is this person's wish: say so rather than quietly choosing.
- A memory is something a person said, not a record: it does not replace looking up what was sung or what a song says.
- Use a memory only where it bears on what is asked. Do not recite them.`;

/**
 * The memories and how to weigh them, as one block for a prompt; null when
 * there is no memory to give. `heading` is the feature's own style of title.
 */
export function memoryBlock(memory: MemoryContext, heading: string): string | null {
  const rendered = renderMemories(memory);
  return rendered ? `${heading}\n${MEMORY_AUTHORITY}\n\n${rendered}` : null;
}
