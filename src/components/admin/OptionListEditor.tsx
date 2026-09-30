"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { addOptionAction, archiveOptionAction, moveOptionAction, renameOptionAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

interface Item {
  id: number;
  label: string;
  archived: boolean;
  usage: number;
}

/**
 * One editable list - titles or instruments. Items in use are archived rather
 * than deleted, so nobody's profile loses what it had; archived items are
 * hidden from the pickers and can be restored.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ id: number; label: string } | null>(null);

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  const active = items.filter((item) => !item.archived);
  const archived = items.filter((item) => item.archived);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-card border border-line">
        {active.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
            {editing?.id === item.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => renameOptionAction(list, item.id, editing.label), () => setEditing(null));
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
                  className="min-h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                  autoFocus
                />
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
                <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{item.label}</p>
                  <p className="text-xs text-muted">{usageVerb} {item.usage === 1 ? "1 person" : `${item.usage} people`}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton
                    label={`Move ${item.label} up`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveOptionAction(list, item.id, "up"))}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${item.label} down`}
                    disabled={pending || index === active.length - 1}
                    onClick={() => run(() => moveOptionAction(list, item.id, "down"))}
                  >
                    ↓
                  </IconButton>
                  <Button type="button" variant="quiet" onClick={() => setEditing({ id: item.id, label: item.label })}>
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={pending}
                    onClick={() => run(() => archiveOptionAction(list, item.id, true))}
                  >
                    Archive
                  </Button>
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
          run(() => addOptionAction(list, newLabel), () => setNewLabel(""));
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
        <Button type="submit" size="lg" disabled={pending || !newLabel.trim()}>
          Add
        </Button>
      </form>

      {archived.length > 0 ? (
        <div>
          <p className="text-xs text-muted">Archived - hidden from the pickers, kept on profiles that already have them.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {archived.map((item) => (
              <li key={item.id} className="flex items-center gap-1">
                <Pill tone="muted">{item.label}</Pill>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending}
                  onClick={() => run(() => archiveOptionAction(list, item.id, false))}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ActionMessage result={result} />
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
