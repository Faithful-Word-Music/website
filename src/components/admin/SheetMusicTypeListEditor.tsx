"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  addSheetMusicTypeAction,
  deleteSheetMusicTypeAction,
  moveSheetMusicTypeAction,
  removeSheetMusicSourceAction,
  renameSheetMusicTypeAction,
} from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { DriveFolderBrowser } from "@/components/admin/DriveFolderBrowser";
import { ArrowIcon, IconButton, PencilIcon } from "@/components/admin/OptionListEditor";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";
import type { DriveFolder } from "@/lib/sheet-music";

interface Source {
  id: number;
  /** The folder: "02 - Instrument Parts › Clarinet › Bb". */
  description: string;
  /** 0 when the folder is no longer in Drive; null when Drive could not be read. */
  folders: number | null;
}

interface Type {
  id: number;
  label: string;
  /** People assigned it. */
  usage: number;
  /** Songs with sheet music of it; null when Drive could not be read. */
  songs: number | null;
  sources: Source[];
}

const words = feedbackContent;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The sheet music types, in the order the dropdowns and song pages list them.
 * Each has a name and its folders: "+ Add folder" browses Drive for another,
 * and × removes one. Edit renames or deletes the type (asking first when
 * people have it).
 */
export function SheetMusicTypeListEditor({
  types,
  folders,
}: {
  types: Type[];
  folders: DriveFolder[] | null;
}) {
  const ids = useId();
  const router = useRouter();
  const { pending, result, run: runAction, stateOf } = useAction();
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ id: number; label: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const [browsingFor, setBrowsingFor] = useState<number | null>(null);

  /** `key` names the button pressed, so only it shows working and done. */
  function run(key: string, action: () => Promise<ActionResult>, onOk?: () => void) {
    void runAction(action, { key, onOk });
  }

  function remove(type: Type) {
    if (type.usage > 0 && confirmingDelete !== type.id) {
      setConfirmingDelete(type.id);
      return;
    }
    run(
      `delete:${type.id}`,
      () => deleteSheetMusicTypeAction(type.id),
      () => {
        setEditing(null);
        setConfirmingDelete(null);
      },
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-card border border-line">
        {types.map((type, index) => (
          <li key={type.id} className="space-y-3 px-3 py-3 sm:px-4">
            {editing?.id === type.id ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(`rename:${type.id}`, () => renameSheetMusicTypeAction(type.id, editing.label), () => setEditing(null));
                }}
              >
                <TextField
                  id={`${ids}-label-${type.id}`}
                  label="Name"
                  value={editing.label}
                  maxLength={PROFILE_LIMITS.optionLabel}
                  onChange={(label) => setEditing({ ...editing, label })}
                />
                {confirmingDelete === type.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">
                      Delete {type.label}? {count(type.usage, "person", "people")} will have no sheet music type.
                    </span>
                    <Button
                      type="button"
                      state={stateOf(`delete:${type.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(type)}
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
                      state={stateOf(`rename:${type.id}`)}
                      pendingLabel={words.saving}
                      doneLabel={words.saved}
                      disabled={pending || !editing.label.trim()}
                    >
                      Save
                    </Button>
                    <Button type="button" variant="quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      state={stateOf(`delete:${type.id}`)}
                      pendingLabel={words.deleting}
                      doneLabel={words.deleted}
                      disabled={pending}
                      onClick={() => remove(type)}
                      className="ml-auto"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{type.label}</p>
                  <p className="text-xs text-muted">
                    Assigned to {count(type.usage, "person", "people")}
                    {type.songs !== null ? ` · On ${count(type.songs, "song", "songs")}` : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={`Move ${type.label} up`}
                    busy={stateOf(`up:${type.id}`) === "pending"}
                    disabled={pending || index === 0}
                    onClick={() => run(`up:${type.id}`, () => moveSheetMusicTypeAction(type.id, "up"))}
                  >
                    <ArrowIcon direction="up" />
                  </IconButton>
                  <IconButton
                    label={`Move ${type.label} down`}
                    busy={stateOf(`down:${type.id}`) === "pending"}
                    disabled={pending || index === types.length - 1}
                    onClick={() => run(`down:${type.id}`, () => moveSheetMusicTypeAction(type.id, "down"))}
                  >
                    <ArrowIcon direction="down" />
                  </IconButton>
                  <IconButton
                    label={`Edit ${type.label}`}
                    text="Edit"
                    disabled={pending}
                    onClick={() => {
                      setConfirmingDelete(null);
                      setEditing({ id: type.id, label: type.label });
                    }}
                  >
                    <PencilIcon />
                  </IconButton>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {type.sources.length === 0 ? (
                <p className="text-xs text-gold-dark">No folders yet, so nothing is listed under this type.</p>
              ) : (
                <ul className="space-y-1.5">
                  {type.sources.map((source) => (
                    <li key={source.id} className="flex items-start gap-2 rounded-lg bg-paper px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm text-ink">{source.description}</p>
                        {source.folders === 0 ? (
                          <p className="text-xs text-gold-dark">Not found in Drive - was the folder moved or renamed?</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove folder ${source.description}`}
                        title="Remove this folder"
                        disabled={pending}
                        aria-busy={stateOf(`source:${source.id}`) === "pending" || undefined}
                        onClick={() => run(`source:${source.id}`, () => removeSheetMusicSourceAction(source.id))}
                        className={cn(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors not-disabled:hover:bg-surface not-disabled:hover:text-ink",
                          // The one at work is not dimmed; its neighbours are.
                          stateOf(`source:${source.id}`) === "pending" ? "text-ink" : "disabled:opacity-30",
                        )}
                      >
                        {stateOf(`source:${source.id}`) === "pending" ? <Spinner /> : <span aria-hidden>×</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {browsingFor === type.id && folders ? (
                <DriveFolderBrowser
                  typeId={type.id}
                  typeLabel={type.label}
                  folders={folders}
                  onDone={(added) => {
                    setBrowsingFor(null);
                    if (added) router.refresh();
                  }}
                />
              ) : folders ? (
                <Button type="button" variant="quiet" disabled={pending} onClick={() => setBrowsingFor(type.id)}>
                  + Add folder
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {types.length === 0 ? <li className="px-4 py-3 text-sm text-muted">No types yet.</li> : null}
      </ul>

      {folders ? null : (
        <p className="text-sm text-muted">
          Google Drive could not be read just now, so folders can&apos;t be added. Names and order can still be changed.
        </p>
      )}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          run("add", () => addSheetMusicTypeAction(newLabel), () => setNewLabel(""));
        }}
      >
        <div className="flex-1">
          <TextField
            id={`${ids}-new`}
            label="Add a type"
            placeholder="Clarinet (Bb)"
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

      <ActionMessage result={result} />
    </div>
  );
}
