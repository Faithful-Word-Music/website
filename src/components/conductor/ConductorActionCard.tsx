"use client";

import { useMemo, useState, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ActionMessage } from "@/components/account/fields";
import { TextDiff } from "@/components/ai/TextDiff";
import { useConductor, type ProposedAction } from "@/components/conductor/conductor-store";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { conductorContent } from "@/content/conductor";
import type { ConductorActionChoice } from "@/lib/ai/conductor/actions";
import type { MemoryScope } from "@/lib/ai/memory/memory";
import { condenseDiff, diffText } from "@/lib/ai/planning/revisions";

const copy = conductorContent.cards;

/** The text a card is about, set apart exactly as it will be stored. */
function Quoted({ label, children, struck = false }: { label: string; children: ReactNode; struck?: boolean }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 whitespace-pre-wrap break-words rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.95rem] leading-relaxed",
          struck ? "text-muted line-through" : "text-ink",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** What became of a card once the person chose. */
function Outcome({ applied, children }: { applied: boolean; children: ReactNode }) {
  return (
    <p role="status" className={cn("flex items-start gap-1.5 text-sm", applied ? "text-ink" : "text-muted")}>
      {applied ? <CheckIcon className="mt-0.5 shrink-0 text-gold-dark" /> : null}
      <span>{children}</span>
    </p>
  );
}

/**
 * A card for something Conductor PROPOSES: a memory to save, change or
 * forget, or a change to the planning philosophy. It shows exactly what would
 * be saved, and nothing happens until the person chooses on it - the choice
 * goes to the server, which checks their permissions and does the writing
 * (POST /api/conductor/actions/[id]). A card is settled once and then only
 * says what was decided.
 *
 * Which choices are offered follows the person's permissions, as the browser
 * knows them. That is a convenience: the server decides.
 */
export function ConductorActionCard({ action }: { action: ProposedAction }) {
  const { userId, nav } = useAccount();
  const { resolve } = useConductor(userId);
  const { pending, result, run, stateOf } = useAction();

  const choose = (choice: ConductorActionChoice) =>
    void run(() => resolve(action.id, choice), {
      key: choice,
      // The conversation is the store's, not the page's: there is nothing for the router to reload.
      refresh: false,
    });

  const waiting = action.status === "pending";
  const can = (permission: "use_personal_ai_memory" | "manage_global_ai_memory" | "manage_planning_philosophy") => nav.permissions.has(permission);

  let heading: string;
  let body: ReactNode;
  let controls: ReactNode;
  let outcome: ReactNode;

  switch (action.kind) {
    case "memory_save": {
      const text = copy.memorySave;
      heading = text.heading;
      body = <Quoted label={text.textLabel}>{action.payload.text}</Quoted>;
      const scopes: Array<{ scope: MemoryScope; allowed: boolean; refused: string }> = [
        { scope: "personal", allowed: can("use_personal_ai_memory"), refused: text.personalNotAllowed },
        { scope: "global", allowed: can("manage_global_ai_memory"), refused: text.globalNotAllowed },
      ];
      controls = (
        <div>
          <p className="text-sm text-ink">{text.prompt}</p>
          <ul className="mt-2.5 grid grid-cols-1 gap-2">
            {scopes.map(({ scope, allowed, refused }) => {
              const suggested = action.payload.suggestedScope === scope;
              return (
                <li key={scope}>
                  <ScopeChoice
                    label={text[scope].label}
                    detail={allowed ? text[scope].detail : refused}
                    note={suggested && allowed ? text.suggested : null}
                    emphasised={suggested && allowed}
                    disabled={pending || !allowed}
                    busy={stateOf(scope) === "pending"}
                    onClick={() => choose(scope)}
                  />
                </li>
              );
            })}
            <li>
              <ScopeChoice
                label={text.cancel.label}
                detail={text.cancel.detail}
                note={null}
                emphasised={false}
                quiet
                disabled={pending}
                busy={stateOf("cancel") === "pending"}
                onClick={() => choose("cancel")}
              />
            </li>
          </ul>
        </div>
      );
      outcome =
        action.status === "applied" ? (
          <Outcome applied>{action.result?.scope === "global" ? text.savedGlobal : text.savedPersonal}</Outcome>
        ) : (
          <Outcome applied={false}>{text.cancelled}</Outcome>
        );
      break;
    }

    case "memory_update": {
      const text = copy.memoryUpdate;
      heading = text.heading;
      body = (
        <div className="space-y-3">
          <p className="text-xs text-muted">{copy.scopes[action.payload.scope]}</p>
          <Quoted label={text.beforeLabel} struck={waiting || action.status === "applied"}>
            {action.payload.before}
          </Quoted>
          <Quoted label={text.afterLabel}>{action.payload.after}</Quoted>
        </div>
      );
      controls = <YesNo apply={text.apply} cancel={text.cancel} pending={pending} stateOf={stateOf} onChoose={choose} />;
      outcome = <Outcome applied={action.status === "applied"}>{action.status === "applied" ? text.applied : text.cancelled}</Outcome>;
      break;
    }

    case "memory_delete": {
      const text = copy.memoryDelete;
      heading = text.heading;
      body = (
        <div className="space-y-3">
          <p className="text-xs text-muted">{copy.scopes[action.payload.scope]}</p>
          <Quoted label={text.textLabel} struck={action.status === "applied"}>
            {action.payload.text}
          </Quoted>
        </div>
      );
      controls = <YesNo apply={text.apply} cancel={text.cancel} pending={pending} stateOf={stateOf} onChoose={choose} />;
      outcome = <Outcome applied={action.status === "applied"}>{action.status === "applied" ? text.applied : text.cancelled}</Outcome>;
      break;
    }

    case "philosophy_edit": {
      const text = copy.philosophyEdit;
      const allowed = can("manage_planning_philosophy");
      heading = text.heading;
      body = <PhilosophyChange action={action} />;
      controls = allowed ? (
        <YesNo apply={text.apply} cancel={text.cancel} pending={pending} stateOf={stateOf} onChoose={choose} />
      ) : (
        <div className="space-y-2.5">
          <p className="text-sm text-gold-dark">{text.notAllowed}</p>
          <Button type="button" variant="secondary" state={stateOf("cancel")} pendingLabel={copy.pending} disabled={pending} onClick={() => choose("cancel")}>
            {text.cancel}
          </Button>
        </div>
      );
      outcome = <Outcome applied={action.status === "applied"}>{action.status === "applied" ? text.applied : text.cancelled}</Outcome>;
      break;
    }
  }

  return (
    <section
      aria-label={heading}
      className={cn(
        "animate-enter mt-3 rounded-card border bg-paper p-4",
        // Waiting on the person, it wears the gold rule; settled, it is one more thing that was said.
        waiting ? "border-[color-mix(in_srgb,var(--color-gold)_55%,var(--color-line))]" : "border-line",
      )}
    >
      <h3 className="font-display text-lg text-ink">{heading}</h3>
      <div className="mt-3">{body}</div>
      <div className="mt-4 space-y-3">
        {waiting ? controls : outcome}
        {waiting ? <ActionMessage result={result} /> : null}
      </div>
    </section>
  );
}

/** One of the places a memory can go (or nowhere): a whole row to press, saying what it means. */
function ScopeChoice({
  label,
  detail,
  note,
  emphasised,
  quiet = false,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  detail: string;
  note: string | null;
  emphasised: boolean;
  quiet?: boolean;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-busy={busy || undefined}
      className={cn(
        "flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
        "not-disabled:hover:border-gold disabled:cursor-not-allowed not-data-busy:disabled:opacity-55",
        quiet ? "border-transparent bg-transparent" : "bg-surface",
        emphasised ? "border-gold" : quiet ? "" : "border-line",
      )}
    >
      <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium text-ink">{busy ? copy.pending : label}</span>
        {note ? <span className="text-xs text-gold-dark">{note}</span> : null}
      </span>
      <span className="text-xs leading-snug text-muted">{detail}</span>
    </button>
  );
}

function YesNo({
  apply,
  cancel,
  pending,
  stateOf,
  onChoose,
}: {
  apply: string;
  cancel: string;
  pending: boolean;
  stateOf: (key?: string) => "idle" | "pending" | "done";
  onChoose: (choice: ConductorActionChoice) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" state={stateOf("apply")} pendingLabel={copy.pending} disabled={pending} onClick={() => onChoose("apply")}>
        {apply}
      </Button>
      <Button type="button" variant="secondary" state={stateOf("cancel")} pendingLabel={copy.pending} disabled={pending} onClick={() => onChoose("cancel")}>
        {cancel}
      </Button>
    </div>
  );
}

type PhilosophyView = "changes" | "proposed" | "current";

/** A proposed change to one section of the philosophy: what changes, and each text whole. */
function PhilosophyChange({ action }: { action: Extract<ProposedAction, { kind: "philosophy_edit" }> }) {
  const text = copy.philosophyEdit;
  const [view, setView] = useState<PhilosophyView>("changes");
  const { before, after, explanation, sectionTitle } = action.payload;
  // Only the text around what changes: the whole of each text is one press away.
  const parts = useMemo(() => condenseDiff(diffText(before, after)), [before, after]);
  const views: Array<{ key: PhilosophyView; label: string }> = [
    { key: "changes", label: text.showChanges },
    { key: "proposed", label: text.showProposed },
    { key: "current", label: text.showCurrent },
  ];

  return (
    <div>
      <p className="break-words text-sm font-medium text-ink">{text.section.replace("{section}", sectionTitle)}</p>
      {explanation ? <p className="mt-1.5 break-words text-sm leading-relaxed text-ink-soft">{explanation}</p> : null}

      <div role="group" aria-label={text.changesLabel} className="mt-3 inline-flex rounded-full border border-line bg-surface p-0.5">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={view === item.key}
            onClick={() => setView(item.key)}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs font-medium transition-colors",
              view === item.key ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-2.5 max-h-80 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface px-3 py-2.5">
        <p className="sr-only">{view === "changes" ? text.changesLabel : view === "proposed" ? text.proposedLabel : text.currentLabel}</p>
        {view === "changes" ? (
          <TextDiff parts={parts} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">{view === "proposed" ? after : before}</p>
        )}
      </div>
    </div>
  );
}
