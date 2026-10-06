"use client";

import { useId, useMemo, useState } from "react";

import { createMemoryAction, deleteMemoryAction, moveMemoryAction, updateMemoryAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Notice } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { useAction } from "@/components/ui/use-action";
import { aiContent } from "@/content/ai";
import { feedbackContent } from "@/content/feedback";
import { MEMORY_CATEGORIES, MEMORY_LIMITS, searchMemories, type Memory, type MemoryScope } from "@/lib/ai/memory/memory";
import { formatDateTime } from "@/lib/auth/format";
import type { ActionResult } from "@/lib/auth/session";
import { plural } from "@/lib/plural";

const content = aiContent.admin.memory;
const words = feedbackContent;

const fieldClasses = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-ink transition-colors hover:border-muted/50 sm:text-sm";

/** A category: any label may be typed, and the usual ones are offered. */
function CategoryField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink">
        {content.categoryLabel}
        <span className="text-xs font-normal text-muted">{content.categoryHint}</span>
      </label>
      <input
        id={id}
        list={`${id}-options`}
        value={value}
        maxLength={MEMORY_LIMITS.categoryChars}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClasses}
      />
      <datalist id={`${id}-options`}>
        {MEMORY_CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * Admin -> AI -> Memory: the person's own memories and the ministry's global
 * ones, each under its own tab, to add to, edit, delete and move.
 *
 * What can be done follows the two memory permissions, which are separate:
 * `canPersonal` (use_personal_ai_memory) and `canGlobal`
 * (manage_global_ai_memory). Someone with neither can still read the global
 * memories - they are what the AI uses for them. The buttons are a
 * convenience; every action checks again on the server.
 */
export function MemoryManager({
  personal,
  global,
  canPersonal,
  canGlobal,
  names,
}: {
  personal: Memory[];
  global: Memory[];
  canPersonal: boolean;
  canGlobal: boolean;
  /** Clerk user ID -> name, for who saved and changed a global memory. */
  names: Record<string, string>;
}) {
  const ids = useId();
  const [scope, setScope] = useState<MemoryScope>(canPersonal ? "personal" : "global");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ text: "", category: "" });
  const [editing, setEditing] = useState<{ id: number; text: string; category: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const { pending, result, run: runAction, stateOf, clear } = useAction();

  const memories = scope === "personal" ? personal : global;
  const canChange = scope === "personal" ? canPersonal : canGlobal;
  const canMove = canPersonal && canGlobal;
  const other: MemoryScope = scope === "personal" ? "global" : "personal";
  const text = content.scopes[scope];
  const shown = useMemo(() => searchMemories(memories, query), [memories, query]);

  const run = (key: string, action: () => Promise<ActionResult>, onOk?: () => void) => void runAction(action, { key, onOk });

  function show(next: MemoryScope) {
    setScope(next);
    setQuery("");
    setEditing(null);
    setDeleting(null);
    clear();
  }

  const tabs: Array<{ scope: MemoryScope; count: number }> = [
    { scope: "personal", count: personal.length },
    { scope: "global", count: global.length },
  ];

  return (
    <div className="mt-8">
      <div role="tablist" aria-label={content.title} className="inline-flex max-w-full flex-wrap rounded-full border border-line bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.scope}
            type="button"
            role="tab"
            id={`${ids}-tab-${tab.scope}`}
            aria-selected={scope === tab.scope}
            aria-controls={`${ids}-panel`}
            onClick={() => show(tab.scope)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              scope === tab.scope ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {content.scopes[tab.scope].tab}
            <span className="tnum text-xs opacity-80">{tab.count}</span>
          </button>
        ))}
      </div>

      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${scope}`} className="mt-6">
        <h2 className="font-display text-2xl text-ink">{text.heading}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{text.body}</p>

        {scope === "personal" && !canPersonal ? (
          <Notice tone="warning" title={content.scopes.personal.heading} className="mt-5">
            {content.noPersonal}
          </Notice>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
            <section className="min-w-0">
              {memories.length > 3 ? (
                <div className="mb-4">
                  <label htmlFor={`${ids}-search`} className="sr-only">
                    {content.search}
                  </label>
                  <input
                    id={`${ids}-search`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={content.search}
                    className={cn(fieldClasses, "rounded-full px-4")}
                  />
                </div>
              ) : null}

              {memories.length === 0 ? (
                <p className="text-muted">{text.empty}</p>
              ) : shown.length === 0 ? (
                <p className="text-muted">{content.noMatches}</p>
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {shown.map((memory) => {
                      const changed = memory.updatedAt !== memory.createdAt;
                      const who = scope === "global" ? names[(changed ? memory.updatedBy : memory.createdBy) ?? ""] : undefined;
                      const when = (changed ? content.changed_on : content.saved_on).replace("{date}", formatDateTime(changed ? memory.updatedAt : memory.createdAt));

                      return (
                        <li key={memory.id} className="px-4 py-4 sm:px-5">
                          {editing?.id === memory.id ? (
                            <form
                              className="space-y-3"
                              onSubmit={(event) => {
                                event.preventDefault();
                                run(`save:${memory.id}`, () => updateMemoryAction(memory.id, editing.text, editing.category), () => setEditing(null));
                              }}
                            >
                              <TextField
                                id={`${ids}-edit-${memory.id}`}
                                label={content.textLabel}
                                hint={content.textHint}
                                value={editing.text}
                                maxLength={MEMORY_LIMITS.textChars}
                                multiline
                                rows={3}
                                onChange={(value) => setEditing({ ...editing, text: value })}
                              />
                              <CategoryField id={`${ids}-edit-category-${memory.id}`} value={editing.category} onChange={(value) => setEditing({ ...editing, category: value })} />
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="submit"
                                  state={stateOf(`save:${memory.id}`)}
                                  pendingLabel={words.saving}
                                  doneLabel={words.saved}
                                  disabled={pending || editing.text.trim() === ""}
                                >
                                  {content.save}
                                </Button>
                                <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                                  {content.cancel}
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap break-words text-ink">{memory.text}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                {memory.category ? <Pill tone="muted">{memory.category}</Pill> : null}
                                <p className="tnum text-xs text-muted">
                                  {when}
                                  {who ? ` ${content.by.replace("{name}", who)}` : ""}
                                </p>
                              </div>

                              {canChange ? (
                                deleting === memory.id ? (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="text-sm text-ink">{content.confirmDelete}</span>
                                    <Button
                                      type="button"
                                      state={stateOf(`delete:${memory.id}`)}
                                      pendingLabel={words.deleting}
                                      doneLabel={words.deleted}
                                      disabled={pending}
                                      onClick={() => run(`delete:${memory.id}`, () => deleteMemoryAction(memory.id), () => setDeleting(null))}
                                    >
                                      {content.confirmYes}
                                    </Button>
                                    <Button type="button" variant="quiet" onClick={() => setDeleting(null)}>
                                      {content.confirmNo}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="-ml-5 mt-1 flex flex-wrap items-center">
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      disabled={pending}
                                      onClick={() => {
                                        clear();
                                        setDeleting(null);
                                        setEditing({ id: memory.id, text: memory.text, category: memory.category ?? "" });
                                      }}
                                    >
                                      {content.edit}
                                    </Button>
                                    {canMove ? (
                                      <Button
                                        type="button"
                                        variant="quiet"
                                        state={stateOf(`move:${memory.id}`)}
                                        pendingLabel={words.working}
                                        doneLabel={words.done}
                                        disabled={pending}
                                        onClick={() => run(`move:${memory.id}`, () => moveMemoryAction(memory.id, other))}
                                      >
                                        {content.moveTo[other]}
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      disabled={pending}
                                      onClick={() => {
                                        clear();
                                        setEditing(null);
                                        setDeleting(memory.id);
                                      }}
                                    >
                                      {content.delete}
                                    </Button>
                                  </div>
                                )
                              ) : null}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              {memories.length > 0 ? <p className="tnum mt-3 text-xs text-muted">{plural(content.count, memories.length)}</p> : null}
              <div className="mt-3">
                <ActionMessage result={result} />
              </div>
            </section>

            <section className="min-w-0">
              <Card className="p-4 sm:p-6">
                <SectionLabel>{text.add}</SectionLabel>
                {canChange ? (
                  <form
                    className="mt-4 space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run("add", () => createMemoryAction(scope, draft.text, draft.category), () => setDraft({ text: "", category: "" }));
                    }}
                  >
                    <TextField
                      id={`${ids}-new`}
                      label={content.textLabel}
                      hint={content.textHint}
                      placeholder={content.textPlaceholder}
                      value={draft.text}
                      maxLength={MEMORY_LIMITS.textChars}
                      multiline
                      rows={4}
                      onChange={(value) => setDraft({ ...draft, text: value })}
                    />
                    <CategoryField id={`${ids}-new-category`} value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} />
                    <Button
                      type="submit"
                      state={stateOf("add")}
                      pendingLabel={words.adding}
                      doneLabel={words.added}
                      disabled={pending || draft.text.trim() === ""}
                    >
                      {text.add}
                    </Button>
                  </form>
                ) : (
                  <p className="mt-2 text-sm text-muted">{content.readOnlyGlobal}</p>
                )}
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
