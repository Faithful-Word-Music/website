"use client";

import { useId, useMemo, useState } from "react";

import { loadPhilosophyRevisionAction, restorePhilosophyAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { TextDiff } from "@/components/ai/TextDiff";
import { ConductorMarkdown } from "@/components/conductor/ConductorMarkdown";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { LOG_PAGE, ShowMore, useShown } from "@/components/ui/ShowMore";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { aiContent } from "@/content/ai";
import { feedbackContent } from "@/content/feedback";
import { parsePlanningPhilosophy } from "@/lib/ai/planning/philosophy";
import { comparePhilosophies, type PhilosophyRevisionSummary, type SectionComparison } from "@/lib/ai/planning/revisions";
import { formatDateTime } from "@/lib/auth/format";

const content = aiContent.admin.philosophy.history;
const words = feedbackContent;

type Loaded = { status: "loading" } | { status: "failed" } | { status: "ready"; markdown: string };

/**
 * The philosophy's history: every version that has been in force, who applied
 * it and how (by hand, from a proposal Conductor made, by restoring), which
 * sections it changed - and each one to read, to compare with the version in
 * force, and to restore. Restoring adds a version; nothing here is removed.
 */
export function PhilosophyHistory({
  revisions,
  names,
  currentId,
  currentMarkdown,
  canRestore,
}: {
  /** Newest first. */
  revisions: PhilosophyRevisionSummary[];
  names: Record<string, string>;
  currentId: number;
  currentMarkdown: string;
  canRestore: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState<"version" | "compare">("compare");
  const [loaded, setLoaded] = useState<Record<number, Loaded>>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const { pending, result, run, stateOf } = useAction();
  // The newest few (the one in force is first); the rest on request.
  const { shown, more } = useShown(revisions.length, LOG_PAGE);
  const when = useMemo(() => new Map(revisions.map((revision) => [revision.id, revision.at])), [revisions]);

  async function show(id: number) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setConfirming(null);
    if (loaded[id]?.status === "ready") return;
    setLoaded((all) => ({ ...all, [id]: { status: "loading" } }));
    const answer = await loadPhilosophyRevisionAction(id).catch(() => null);
    setLoaded((all) => ({ ...all, [id]: answer?.ok ? { status: "ready", markdown: answer.value.markdown } : { status: "failed" } }));
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl text-ink">{content.heading}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{content.body}</p>

      <Card className="mt-5 overflow-hidden">
        <ol className="divide-y divide-line">
          {revisions.slice(0, shown).map((revision) => {
            const current = revision.id === currentId;
            const expanded = open === revision.id;
            const state = loaded[revision.id];
            const who = revision.by ? names[revision.by] : undefined;
            const restoredAt = revision.restoredFrom ? when.get(revision.restoredFrom) : undefined;
            const detail =
              revision.source === "seed"
                ? content.seed
                : revision.source === "restore" && restoredAt
                  ? content.restoredFrom.replace("{date}", formatDateTime(restoredAt))
                  : revision.changedSections.length > 0
                    ? content.sections.replace("{sections}", revision.changedSections.join(", "))
                    : content.reordered;

            return (
              <li key={revision.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="tnum text-ink">
                      {formatDateTime(revision.at)}
                      {who ? <span className="text-muted"> {aiContent.admin.philosophy.history.by.replace("{name}", who)}</span> : null}
                    </p>
                    <p className="mt-1 break-words text-sm text-muted">{detail}</p>
                    {revision.note ? <p className="mt-1 break-words text-sm text-ink-soft">“{revision.note}”</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {current ? <Pill tone="strong">{content.current}</Pill> : null}
                    <Pill tone="muted">{content.sources[revision.source]}</Pill>
                    <Button
                      type="button"
                      variant="quiet"
                      aria-expanded={expanded}
                      aria-controls={`${ids}-${revision.id}`}
                      onClick={() => void show(revision.id)}
                      className="px-2"
                    >
                      {expanded ? content.hide : content.view}
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div id={`${ids}-${revision.id}`} className="animate-enter mt-4">
                    {!state || state.status === "loading" ? (
                      <p role="status" className="flex items-center gap-2.5 text-sm text-muted">
                        <Spinner />
                        {content.loading}
                      </p>
                    ) : state.status === "failed" ? (
                      <p role="alert" className="text-sm text-gold-dark">
                        {content.failed}
                      </p>
                    ) : (
                      <>
                        {current ? null : (
                          <div role="group" aria-label={content.compare} className="mb-4 inline-flex max-w-full flex-wrap rounded-full border border-line bg-surface p-0.5">
                            {(["compare", "version"] as const).map((key) => (
                              <button
                                key={key}
                                type="button"
                                aria-pressed={view === key}
                                onClick={() => setView(key)}
                                className={cn(
                                  "min-h-9 rounded-full px-3 text-xs font-medium transition-colors",
                                  view === key ? "bg-ink text-paper" : "text-muted hover:text-ink",
                                )}
                              >
                                {key === "compare" ? content.showCompare : content.showVersion}
                              </button>
                            ))}
                          </div>
                        )}

                        <RevisionBody markdown={state.markdown} currentMarkdown={currentMarkdown} compare={!current && view === "compare"} />

                        {canRestore && !current ? (
                          <div className="mt-5 border-t border-line pt-4">
                            {confirming === revision.id ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-ink">{content.confirmRestore}</span>
                                <Button
                                  type="button"
                                  state={stateOf(`restore:${revision.id}`)}
                                  pendingLabel={words.restoring}
                                  doneLabel={words.restored}
                                  disabled={pending}
                                  onClick={() =>
                                    void run(() => restorePhilosophyAction(revision.id, currentId), {
                                      key: `restore:${revision.id}`,
                                      onOk: () => {
                                        setConfirming(null);
                                        setOpen(null);
                                      },
                                    })
                                  }
                                >
                                  {content.confirmYes}
                                </Button>
                                <Button type="button" variant="quiet" onClick={() => setConfirming(null)}>
                                  {content.confirmNo}
                                </Button>
                              </div>
                            ) : (
                              <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(revision.id)}>
                                {content.restore}
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>
      <ShowMore shown={shown} total={revisions.length} step={LOG_PAGE.step} onMore={more} />
      <div className="mt-3">
        <ActionMessage result={result} />
      </div>
    </section>
  );
}

const CHANGE_TONE: Record<SectionComparison["change"], "muted" | "warning" | "neutral"> = {
  same: "muted",
  changed: "warning",
  added: "neutral",
  removed: "neutral",
};

/** One version, either as it read or as how the version in force differs from it. */
function RevisionBody({ markdown, currentMarkdown, compare }: { markdown: string; currentMarkdown: string; compare: boolean }) {
  const version = useMemo(() => parsePlanningPhilosophy(markdown), [markdown]);
  const now = useMemo(() => parsePlanningPhilosophy(currentMarkdown), [currentMarkdown]);
  // From this version to the one in force: what is marked as added is what has been written since.
  const sections = useMemo(
    () => (compare && version.ok && now.ok ? comparePhilosophies(version.philosophy, now.philosophy) : null),
    [compare, version, now],
  );

  if (!version.ok) return <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{markdown}</p>;

  if (sections) {
    const differing = sections.filter((section) => section.change !== "same");
    if (differing.length === 0) return <p className="text-sm text-muted">{content.same}</p>;
    return (
      <ul className="space-y-5">
        {differing.map((section) => (
          <li key={section.title}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-display text-lg text-ink">{section.title}</h3>
              <Pill tone={CHANGE_TONE[section.change]}>{content.changes[section.change]}</Pill>
            </div>
            <TextDiff parts={section.parts} className="mt-2 rounded-lg border border-line bg-paper px-3.5 py-3" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-6">
      {version.philosophy.sections.map((section) => (
        <li key={section.id}>
          <h3 className="break-words font-display text-lg text-ink">{section.title}</h3>
          <div className="mt-2">
            <ConductorMarkdown text={section.text} />
          </div>
        </li>
      ))}
    </ul>
  );
}
