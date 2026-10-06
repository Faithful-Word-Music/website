import { NoAccess, Notice } from "@/components/account/Notices";
import { PhilosophyEditor } from "@/components/admin/PhilosophyEditor";
import { PhilosophyHistory } from "@/components/admin/PhilosophyHistory";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { aiContent } from "@/content/ai";
import { namesOf } from "@/lib/ai/people";
import { loadPlanningPhilosophy } from "@/lib/ai/planning/load";
import { PHILOSOPHY_MAX_CHARS } from "@/lib/ai/planning/philosophy";
import { toDraft, type PhilosophyRevisionSummary } from "@/lib/ai/planning/revisions";
import { listPhilosophyRevisions } from "@/lib/ai/planning/store";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata = { title: "Planning philosophy" };

const content = aiContent.admin.philosophy;

/**
 * /admin/ai/philosophy - the Service Planning Philosophy the AI plans by, a
 * section at a time, and every version it has been (use_ai to read it).
 *
 * This reads the SAME philosophy every AI feature does
 * (loadPlanningPhilosophy): the latest version in the database, the first
 * being copied from the repository's document the first time it is asked for.
 * Editing and restoring need manage_planning_philosophy; without it the page
 * is read-only, and the actions refuse regardless.
 */
export default async function PhilosophyPage() {
  const viewer = await requireAnyPermission("/admin/ai/philosophy", ["use_ai"]);
  if (!viewer) return <NoAccess />;

  const loaded = await loadPlanningPhilosophy(viewer.env);
  let revisions: PhilosophyRevisionSummary[] = [];
  try {
    revisions = await listPhilosophyRevisions(viewer.env);
  } catch (error) {
    console.error("[ai] Could not load the philosophy's history:", error instanceof Error ? error.message : "unknown error");
  }
  const names = await namesOf(revisions.map((revision) => revision.by));
  const canEdit = viewer.can("manage_planning_philosophy");

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      {loaded.ok ? (
        <>
          <PhilosophyEditor
            // A fresh editor once another version is in force, so "changed" is measured from it.
            key={loaded.revisionId ?? "document"}
            draft={toDraft(loaded.philosophy)}
            // With no database there is nowhere to keep a change: the document in the repository is all there is.
            revisionId={loaded.revisionId}
            canEdit={canEdit && loaded.revisionId !== null}
            readOnlyNote={canEdit ? null : content.readOnly}
            maxChars={PHILOSOPHY_MAX_CHARS}
          />
          {loaded.revisionId !== null && revisions.length > 0 ? (
            <PhilosophyHistory
              revisions={revisions}
              names={Object.fromEntries(names)}
              currentId={loaded.revisionId}
              currentMarkdown={loaded.philosophy.markdown}
              canRestore={canEdit}
            />
          ) : null}
        </>
      ) : (
        <Notice tone="warning" title={content.unavailable.title} className="mt-8">
          {content.unavailable.body}
        </Notice>
      )}
    </div>
  );
}
