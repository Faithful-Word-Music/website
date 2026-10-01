/**
 * "Needs your attention": the short list at the top of the Dashboard of
 * things the person should actually do something about.
 *
 * Each feature contributes items from its own real data (a provider is just
 * a function returning AttentionItem[]); the Dashboard gathers them with
 * collectAttention(). Nothing is ever added to make the list look full - an
 * empty list means the section is not shown at all.
 *
 * Phase 1 providers live in src/lib/dashboard/providers.ts: an unfinished
 * profile, and account requests waiting for review. Later features add
 * theirs (availability not given, services needing a plan, sheet-music
 * reports...).
 *
 * Pure - no server-only import - so it can be unit tested.
 */

export type AttentionPriority = "urgent" | "normal" | "low";

export interface AttentionItem {
  /**
   * Stable and unique per thing, e.g. "admin:account-requests". Two
   * responsibilities raising the same thing use the same id, and it shows once.
   */
  id: string;
  priority: AttentionPriority;
  title: string;
  detail?: string;
  href: string;
  /** The link text, e.g. "Review requests". */
  action: string;
}

const RANK: Record<AttentionPriority, number> = { urgent: 0, normal: 1, low: 2 };

/**
 * Every item once, most pressing first. Within a priority the providers'
 * order is kept. When an id appears twice, its most pressing copy wins.
 */
export function collectAttention(...groups: ReadonlyArray<readonly AttentionItem[]>): AttentionItem[] {
  const byId = new Map<string, { item: AttentionItem; order: number }>();
  let order = 0;
  for (const group of groups) {
    for (const item of group) {
      const existing = byId.get(item.id);
      if (!existing || RANK[item.priority] < RANK[existing.item.priority]) {
        byId.set(item.id, { item, order: existing?.order ?? order });
      }
      order += 1;
    }
  }
  return [...byId.values()]
    .sort((a, b) => RANK[a.item.priority] - RANK[b.item.priority] || a.order - b.order)
    .map(({ item }) => item);
}
