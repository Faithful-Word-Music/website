"use client";

import { useId, useState, type ReactNode } from "react";

import {
  addOptionAction,
  archiveOptionAction,
  deleteOptionAction,
  moveOptionAction,
  renameOptionAction,
} from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

const words = feedbackContent;

interface Item {
  id: number;
  label: string;
  archived: boolean;
  usage: number;
}

/**
 * One editable list - titles or instruments. Each row has move up/down and
 * Edit; editing offers Rename and Delete. Deleting an item takes it off the
 * profiles that had it (it asks first, saying how many), and it can simply
 * be added again. Items archived before deleting existed are listed below,
 * to restore or delete.
 */
export function OptionListEditor({
  list,
  items,
  noun,
  usageVerb,
}: {
  list: "titles" | "instruments";
  items: Item[];
  noun: string;
  /** "Held by" or "Played by", followed by the count. */
  usageVerb: string;
}) {
  const ids = useId();
  const { pending, result, run: runAction, stateOf } = useAction();
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ id: number; label: string } | null>(null);
  /** The item whose Delete was pressed and is waiting for "Yes, delete". */
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  function startEditing(item: Item) {
    setConfirmingDelete(null);
    setEditing({ id: item.id, label: item.label });
  }

  /** Items nobody has go at once; anything in use asks first. */
  function remove(item: Item) {
    if (item.usage > 0 && confirmingDelete !== item.id) {
      setConfirmingDelete(item.id);
      return;
    }
    run(
      `delete:${item.id}`,
      () => deleteOptionAction(list, item.id),
      () => {
        setEditing(null);
        setConfirmingDelete(null);
      },
    );
  }

  const people = (count: number) => (count === 1 ? "1 person" : `${count} people`);

  /** `key` names the button pressed, so only it shows working and done. */
  function run(key: string, action: () => Promise<ActionResult>, onOk?: () => void) {
    void runAction(action, { key, onOk });
  }

  const active = items.filter((item) => !item.archived);
  const archived = items.filter((item) => item.archived);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-card border border-line">
        {active.map((item, index) => (
          <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            {editing?.id === item.id ? (
              <form
                className="flex flex-1 flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(`rename:${item.id}`, () => renameOptionAction(list, item.id, editing.label), () => setEditing(null));
                }}
              >
                <label htmlFor={`${ids}-rename-${item.id}`} className="sr-only">
                  New name for {item.label}
                </label>
                <input
                  id={`${ids}-rename-${item.id}`}
                  value={editing.label}
                  maxLength={PROFILE_LIMITS.optionLabel}
                  onChange={(event) => setEditing({ id: item.id, label: event.target.value })}
                  // 16px on phones, so iOS does not zoom in on focus.
                  className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-ink sm:text-sm"
                  autoFocus
                />
                {confirmingDelete === item.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">
                      Delete {item.label}? It comes off {people(item.usage)}&apos;s profile.
                    </span>
                    <Button
                      type="button"
                      state={stateOf(`delete:${item.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(item)}
                    >
                      Yes, delete
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => setConfirmingDelete(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      state={stateOf(`rename:${item.id}`)}
                      pendingLabel={words.saving}
                      doneLabel={words.saved}
                      disabled={pending}
                    >
                      Save
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      state={stateOf(`delete:${item.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(item)}
                      className="ml-auto"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{item.label}</p>
                  <p className="truncate text-xs text-muted">
                    {usageVerb} {people(item.usage)}
                  </p>
                </div>
                {/* Icons on phones; the word joins Edit where there is room. */}
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={`Move ${item.label} up`}
                    busy={stateOf(`up:${item.id}`) === "pending"}
                    disabled={pending || index === 0}
                    onClick={() => run(`up:${item.id}`, () => moveOptionAction(list, item.id, "up"))}
                  >
                    <ArrowIcon direction="up" />
                  </IconButton>
                  <IconButton
                    label={`Move ${item.label} down`}
                    busy={stateOf(`down:${item.id}`) === "pending"}
                    disabled={pending || index === active.length - 1}
                    onClick={() => run(`down:${item.id}`, () => moveOptionAction(list, item.id, "down"))}
                  >
                    <ArrowIcon direction="down" />
                  </IconButton>
                  <IconButton
                    label={`Edit ${item.label}`}
                    text="Edit"
                    disabled={pending}
                    onClick={() => startEditing(item)}
                  >
                    <PencilIcon />
                  </IconButton>
                </div>
              </>
            )}
          </li>
        ))}
        {active.length === 0 ? <li className="px-4 py-3 text-sm text-muted">Nothing on this list yet.</li> : null}
      </ul>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          run("add", () => addOptionAction(list, newLabel), () => setNewLabel(""));
        }}
      >
        <div className="flex-1">
          <TextField
            id={`${ids}-new`}
            label={`Add ${noun}`}
            value={newLabel}
            maxLength={PROFILE_LIMITS.optionLabel}
            onChange={setNewLabel}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          state={stateOf("add")}
          pendingLabel={words.adding}
          doneLabel={words.added}
          disabled={pending || !newLabel.trim()}
        >
          Add
        </Button>
      </form>

      {archived.length > 0 ? (
        <div>
          <p className="text-xs text-muted">
            Archived earlier - hidden from the pickers, still on profiles that have them.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {archived.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-1">
                <Pill tone="muted">{item.label}</Pill>
                {confirmingDelete === item.id ? (
                  <>
                    <Button
                      type="button"
                      state={stateOf(`delete:${item.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(item)}
                    >
                      Yes, delete
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => setConfirmingDelete(null)}>
                      Keep it
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="quiet"
                      state={stateOf(`restore:${item.id}`)}
                      pendingLabel={words.restoring}
                      doneLabel={words.restored}
                      disabled={pending}
                      onClick={() => run(`restore:${item.id}`, () => archiveOptionAction(list, item.id, false))}
                    >
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      state={stateOf(`delete:${item.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(item)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ActionMessage result={result} />
    </div>
  );
}

/**
 * A row action: an icon, with its word beside it from sm up when `text` is
 * given. 40px square on phones, so it stays easy to tap. While its action
 * runs (`busy`) a spinner takes the icon's place, undimmed.
 */
export function IconButton({
  label,
  text,
  disabled,
  busy = false,
  onClick,
  children,
}: {
  label: string;
  text?: string;
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full text-sm text-muted transition-colors not-disabled:hover:bg-paper not-disabled:hover:text-ink",
        busy ? "text-ink" : "disabled:opacity-30",
        text && "sm:px-3",
      )}
    >
      {busy ? <Spinner /> : children}
      {text ? <span className="hidden sm:inline">{text}</span> : null}
    </button>
  );
}

const iconProps = {
  "aria-hidden": true,
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg {...iconProps} className={direction === "down" ? "rotate-180" : undefined}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
    </svg>
  );
}
