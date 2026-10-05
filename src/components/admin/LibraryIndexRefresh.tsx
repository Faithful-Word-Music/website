"use client";

import { useId, useState } from "react";

import { refreshLibraryIndexAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { useAction } from "@/components/ui/use-action";
import { aiContent } from "@/content/ai";
import { mergeReports, type RefreshReport } from "@/lib/library-content/plan";
import { plural } from "@/lib/plural";

const content = aiContent.admin.library;

/** A refresh is asked again until nothing is left; this many passes is far more than a whole library needs. */
const MAX_PASSES = 60;

/** What a refresh did, as one sentence's worth of parts. */
export function describeRefresh(report: RefreshReport): string[] {
  const { report: text } = content;
  const did = [
    report.added > 0 ? plural(text.added, report.added) : null,
    report.updated > 0 ? plural(text.updated, report.updated) : null,
    report.removed > 0 ? plural(text.removed, report.removed) : null,
    report.embedded > 0 ? plural(text.embedded, report.embedded) : null,
  ].filter((part): part is string => part !== null);
  const stands = [
    report.unchanged > 0 ? plural(text.unchanged, report.unchanged) : null,
    report.noSource > 0 ? plural(text.noSource, report.noSource) : null,
    report.noLyrics > 0 ? plural(text.noLyrics, report.noLyrics) : null,
    report.failed > 0 ? plural(text.failed, report.failed) : null,
  ].filter((part): part is string => part !== null);
  return [did.length > 0 ? did.join(", ") : text.nothing.replace(/\.$/, ""), ...stands];
}

/**
 * Admin -> AI's "Refresh library index". One refresh is several short
 * requests: each reads files for a while and says what is left, and this asks
 * again until nothing is, showing how far it has got. The page's figures
 * refresh by themselves once it has finished.
 */
export function LibraryIndexRefresh({ disabled }: { disabled?: boolean }) {
  const { pending, result, run, stateOf } = useAction();
  const [progress, setProgress] = useState<RefreshReport | null>(null);
  const [report, setReport] = useState<RefreshReport | null>(null);

  const refresh = async () => {
    let total: RefreshReport | null = null;
    let embeddingMessage: string | null = null;

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const answer = await refreshLibraryIndexAction(pass > 0);
      if (!answer.ok) return answer;
      const latest = answer.value.report;
      total = total ? mergeReports(total, latest) : latest;
      embeddingMessage = answer.value.embeddingMessage;
      setProgress(total);

      const finished = latest.songsRemaining === 0 && latest.embeddingsRemaining === 0;
      // A pass that got nowhere will not get further by being asked again.
      const stuck = latest.read === 0 && latest.embedded === 0;
      if (finished || stuck || embeddingMessage) break;
    }

    if (!total) return { ok: false as const, error: content.unfinished };
    setReport(total);
    if (embeddingMessage && total.songsRemaining === 0) {
      return { ok: false as const, error: content.embeddingStopped.replace("{message}", embeddingMessage) };
    }
    if (total.songsRemaining > 0 || total.embeddingsRemaining > 0) return { ok: false as const, error: content.unfinished };
    return { ok: true as const, message: `${describeRefresh(total)[0]}.` };
  };

  const working = pending && progress;
  const filesToRead = progress ? progress.read + progress.songsRemaining : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="secondary"
          state={stateOf()}
          pendingLabel={content.pending}
          doneLabel={content.done}
          disabled={pending || disabled}
          onClick={() => {
            setProgress(null);
            setReport(null);
            void run(refresh);
          }}
        >
          {content.button}
        </Button>
        <ActionMessage result={result} />
      </div>

      {working ? (
        <p role="status" className="tnum mt-3 text-sm text-muted">
          {progress.songsRemaining > 0 || filesToRead > 0
            ? content.progress.replace("{done}", progress.read.toLocaleString("en-US")).replace("{total}", filesToRead.toLocaleString("en-US"))
            : null}
          {progress.songsRemaining === 0 && progress.embeddingsRemaining > 0 ? ` ${plural(content.embedding, progress.embeddingsRemaining)}` : null}
        </p>
      ) : null}

      {report && !pending ? (
        <ul className="mt-4 animate-enter space-y-1 border-l-2 border-gold pl-4 text-sm text-muted">
          {describeRefresh(report)
            .slice(1)
            .map((line) => (
              <li key={line} className="tnum">
                {line}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The songs whose file could not be indexed, folded away until asked for. */
export function LibraryIndexProblems({
  problems,
}: {
  problems: Array<{ title: string; collection: string | null; hymnNumber: string | null; status: "failed" | "no_lyrics"; detail: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (problems.length === 0) return null;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex cursor-pointer items-center gap-2 text-left text-sm font-medium text-ink"
      >
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          className={cn("shrink-0 text-muted transition-transform duration-200", open && "rotate-90")}
        >
          <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {plural(content.problems.toggle, problems.length)}
      </button>
      <Collapse open={open} id={id}>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {problems.map((song) => (
            <li key={`${song.collection}|${song.hymnNumber}|${song.title}`} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="break-words text-ink">
                  {song.hymnNumber ? <span className="tnum text-muted">{song.hymnNumber} · </span> : null}
                  {song.title}
                </p>
                {song.collection ? <p className="text-xs text-muted">{song.collection}</p> : null}
              </div>
              <p className="shrink-0 text-xs text-muted sm:text-right">
                {song.status === "failed" ? content.problems.failed : content.problems.noLyrics}
              </p>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
