import "server-only";

import type { Viewer } from "@/lib/auth/session";

import type { AiFeature } from "../features";
import { NO_MEMORY, type MemoryContext } from "../memory/memory";
import { memoryForRequest } from "../memory/service";
import { memoryDeps } from "../memory/store";
import { loadPlanningPhilosophy, type LoadedPhilosophy } from "../planning/load";
import { CONTEXT_SOURCES, memoryFor } from "./authority";

/**
 * The one place an AI request gets its standing context: the planning
 * philosophy in force and the memories that apply to the person asking.
 * Conductor, Generate with AI and Suggest with AI all ask here, so none of
 * them builds its own idea of what the AI should know.
 *
 * What a feature may be given is decided by CONTEXT_SOURCES (authority.ts),
 * not by the caller. A conversation is deliberately NOT something this
 * returns: Conductor reads its own (src/lib/ai/conversations), and no other
 * feature has a way to ask for one.
 *
 * Never throws. Memory that cannot be read is no memory - a request is not
 * failed for it - and a philosophy that cannot be read is `ok: false`, which
 * each feature already handles.
 */

export interface AiContext {
  philosophy: LoadedPhilosophy;
  /** Shared and personal memory, each already limited to what this person and this feature may have. */
  memory: MemoryContext;
}

/** The memories for one request: what the person may see, narrowed to what the feature may be given. */
export async function loadMemoryContext(viewer: Viewer, feature: AiFeature, query = ""): Promise<MemoryContext> {
  const sources = CONTEXT_SOURCES[feature];
  if (!sources.globalMemory && !sources.personalMemory) return NO_MEMORY;
  try {
    return memoryFor(feature, await memoryForRequest(viewer, memoryDeps(viewer.env), query));
  } catch (error) {
    console.error("[ai] Could not read memory:", error instanceof Error ? error.message : "unknown error");
    return NO_MEMORY;
  }
}

/** `query` is what is being asked, for choosing among more memories than fit. */
export async function assembleAiContext(viewer: Viewer, feature: AiFeature, options: { query?: string } = {}): Promise<AiContext> {
  const sources = CONTEXT_SOURCES[feature];
  const [philosophy, memory] = await Promise.all([
    sources.philosophy === "none" ? ({ ok: false } as const) : loadPlanningPhilosophy(viewer.env),
    loadMemoryContext(viewer, feature, options.query),
  ]);
  return { philosophy, memory };
}
