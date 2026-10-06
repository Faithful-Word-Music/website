/**
 * The site's AI features. Every AI request names the one it belongs to, and
 * the usage log (src/lib/ai/store.ts) keeps it - so cost can be told apart by
 * feature. A new feature adds its entry here before it makes a request.
 *
 * Each key is stable from a feature's first request, so its usage is always
 * reported under one name. See AI.md.
 *
 * Pure - no server-only import - so pages, forms and tests can share it.
 */
export const AI_FEATURES = {
  connection_test: { label: "Connection test" },
  assistant: { label: "Conductor" },
  generate_service_plan: { label: "Generate Service Plan" },
  replace_song: { label: "Replace Song with AI" },
  library_indexing: { label: "Library Indexing / Embeddings" },
} as const satisfies Record<string, { label: string }>;

export type AiFeature = keyof typeof AI_FEATURES;

export function isAiFeature(value: string): value is AiFeature {
  return Object.hasOwn(AI_FEATURES, value);
}

/** A feature's name for a page. A key the code no longer knows is shown as it was logged. */
export function aiFeatureLabel(key: string): string {
  return isAiFeature(key) ? AI_FEATURES[key].label : key;
}
