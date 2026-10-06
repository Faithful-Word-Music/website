/**
 * The one AI and system notification: a refresh of the library index left
 * song files it could not read.
 *
 * Only failures that are NEW in this refresh count. A file that failed last
 * time and fails again is the same unresolved problem, already told, so a
 * refresh run again says nothing more; and the passes of one long refresh
 * fold into one notification (catalog.ts). Whoever pressed Refresh has the
 * result on the page in front of them, so they are left out.
 *
 * Nothing else the AI does notifies: answers, suggestions, generated plans,
 * successful refreshes and ordinary errors are all shown where they happen.
 *
 * Pure - no server-only import - so every rule here is unit tested.
 */

import { notificationsContent } from "@/content/notifications";
import { plural } from "@/lib/plural";

import { AUDIENCES } from "../audience";
import type { NotifyInput } from "../service";

const copy = notificationsContent.events.library.indexProblem;

export function libraryIndexProblem(input: { actorId: string; newlyFailed: number; failed: number }): NotifyInput | null {
  if (input.newlyFailed <= 0) return null;
  // Everything that cannot be read now, not only what failed just then: that is what needs looking at.
  const count = Math.max(input.failed, input.newlyFailed);
  return {
    event: "ai.library_index_problem",
    audience: AUDIENCES.aiUsers,
    title: copy.title,
    body: plural(copy.body, count),
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: { type: "library-index", id: "failures" },
    payload: { newlyFailed: input.newlyFailed, failed: count },
  };
}
