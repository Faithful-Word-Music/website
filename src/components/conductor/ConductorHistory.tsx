"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ActionMessage } from "@/components/account/fields";
import { IconButton, PencilIcon } from "@/components/admin/OptionListEditor";
import { NewChatIcon } from "@/components/conductor/ConductorMark";
import { useConductor } from "@/components/conductor/conductor-store";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { conductorContent } from "@/content/conductor";
import { feedbackContent } from "@/content/feedback";
import { CONVERSATION_LIMITS, type ConversationSummary } from "@/lib/ai/conversations/model";

const copy = conductorContent.history;
const words = feedbackContent;

/** When a conversation was last spoken in, as briefly as it can be said: a time today, else a day, else a date. */
export function lastSpoken(iso: string, now: number): string {
  const at = new Date(iso);
  const today = new Date(now);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return copy.yesterday;
  if (days < 7) return at.toLocaleDateString("en-US", { weekday: "long" });
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(at.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8M6.75 7v4M9.25 7v4" />
    </svg>
  );
}

/**
 * The person's saved conversations: open one, start a new one, rename,
 * delete. The ONE list - the Conductor page shows it in a dialog, the desktop
 * panel and the phone sheet show it in place of the conversation - over the
 * same store (conductor-store.ts), so a conversation renamed or deleted in
 * one is renamed or deleted in all.
 *
 * `onDone` is called when the person has picked where to go (a conversation,
 * or a new one), so whatever is showing the list can show the conversation.
 */
export function ConductorHistory({ onDone, className }: { onDone: () => void; className?: string }) {
  const { userId } = useAccount();
  const { session, history, loadHistory, open, reset, rename, remove } = useConductor(userId);
  const { pending, result, run, stateOf, clear } = useAction();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const ids = useId();

  // Read when the list is first shown, so opening it always starts from what is saved.
  useEffect(() => {
    if (userId) loadHistory();
  }, [userId, loadHistory]);

  const shown = useMemo(() => {
    const asked = query.trim().toLowerCase();
    return asked === "" ? history.conversations : history.conversations.filter((item) => item.title.toLowerCase().includes(asked));
  }, [history.conversations, query]);

  function choose(conversation: ConversationSummary) {
    open(conversation.id);
    onDone();
  }

  function startNew() {
    reset();
    onDone();
  }

  const loading = history.status === "loading" && history.conversations.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
        <label htmlFor={`${ids}-search`} className="sr-only">
          {copy.search}
        </label>
        <input
          id={`${ids}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          // 16px on phones, so iOS does not zoom in on focus.
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-base text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-gold sm:text-sm"
        />
        <Button type="button" variant="secondary" onClick={startNew} className="shrink-0 px-3.5">
          <NewChatIcon />
          <span>{copy.newChat}</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {loading ? (
          <p role="status" className="flex items-center gap-2.5 px-2 py-6 text-sm text-muted">
            <Spinner />
            {copy.loading}
          </p>
        ) : history.status === "error" && history.conversations.length === 0 ? (
          <div role="alert" className="px-2 py-6">
            <p className="text-sm text-gold-dark">{copy.failed}</p>
            <Button type="button" variant="quiet" onClick={loadHistory} className="mt-1 px-0">
              {copy.retry}
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted">{history.conversations.length === 0 ? copy.empty : copy.noMatches}</p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((conversation) => {
              const current = conversation.id === session.conversationId;
              const title = conversation.title || copy.untitled;

              if (editing?.id === conversation.id) {
                return (
                  <li key={conversation.id} className="rounded-lg bg-paper px-2 py-2.5">
                    <form
                      className="flex flex-col gap-2.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => rename(conversation.id, editing.title), {
                          key: `rename:${conversation.id}`,
                          refresh: false,
                          onOk: () => setEditing(null),
                        });
                      }}
                    >
                      <label htmlFor={`${ids}-title-${conversation.id}`} className="sr-only">
                        {copy.renameLabel.replace("{title}", title)}
                      </label>
                      <input
                        id={`${ids}-title-${conversation.id}`}
                        value={editing.title}
                        maxLength={CONVERSATION_LIMITS.titleChars}
                        onChange={(event) => setEditing({ id: conversation.id, title: event.target.value })}
                        className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-ink sm:text-sm"
                        autoFocus
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="submit"
                          state={stateOf(`rename:${conversation.id}`)}
                          pendingLabel={words.saving}
                          doneLabel={words.saved}
                          disabled={pending || editing.title.trim() === ""}
                        >
                          {copy.save}
                        </Button>
                        <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                          {copy.cancel}
                        </Button>
                      </div>
                    </form>
                  </li>
                );
              }

              if (deleting === conversation.id) {
                return (
                  <li key={conversation.id} className="rounded-lg bg-paper px-3 py-3">
                    <p className="break-words text-sm text-ink">{copy.confirmDelete.replace("{title}", title)}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        state={stateOf(`delete:${conversation.id}`)}
                        pendingLabel={words.deleting}
                        doneLabel={words.deleted}
                        disabled={pending}
                        onClick={() =>
                          void run(() => remove(conversation.id), {
                            key: `delete:${conversation.id}`,
                            refresh: false,
                            onOk: () => setDeleting(null),
                          })
                        }
                      >
                        {copy.confirmYes}
                      </Button>
                      <Button type="button" variant="quiet" onClick={() => setDeleting(null)}>
                        {copy.confirmNo}
                      </Button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={conversation.id} className="group flex items-center gap-1 rounded-lg transition-colors hover:bg-paper">
                  <button
                    type="button"
                    onClick={() => choose(conversation)}
                    aria-current={current ? "true" : undefined}
                    className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-lg px-2.5 py-2 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {current ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" /> : null}
                      <span className={cn("truncate text-sm", current ? "font-medium text-ink" : "text-ink")}>{title}</span>
                    </span>
                    <span className="tnum mt-0.5 text-xs text-muted">
                      {current ? `${copy.current} · ` : ""}
                      {lastSpoken(conversation.lastMessageAt, now)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center pr-1">
                    <IconButton
                      label={`${copy.rename}: ${title}`}
                      disabled={pending}
                      onClick={() => {
                        clear();
                        setDeleting(null);
                        setEditing({ id: conversation.id, title: conversation.title });
                      }}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      label={`${copy.delete}: ${title}`}
                      disabled={pending}
                      onClick={() => {
                        clear();
                        setEditing(null);
                        setDeleting(conversation.id);
                      }}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-2 pt-2">
          <ActionMessage result={result && !result.ok ? result : null} />
        </div>
      </div>
    </div>
  );
}
