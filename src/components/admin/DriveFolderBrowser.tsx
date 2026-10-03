"use client";

import { useEffect, useState } from "react";

import { addSheetMusicSourceAction, previewSheetMusicSourceAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import type { ActionResult } from "@/lib/auth/session";
import type { DriveFolder } from "@/lib/sheet-music";

const keyOf = (path: readonly string[]) => path.join("/").toLowerCase();
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Browsing the Drive "Sheet Music" folder to add a source to a type: open
 * folders to go in, then "Choose this folder" - the type then takes every
 * file in that folder and the folders inside it. PDF and MuseScore folders
 * are not listed: a source always takes both.
 */
export function DriveFolderBrowser({
  typeId,
  typeLabel,
  folders,
  onDone,
}: {
  typeId: number;
  typeLabel: string;
  folders: DriveFolder[];
  /** Closes the browser; `added` when a source was added. */
  onDone: (added: boolean) => void;
}) {
  const [path, setPath] = useState<string[]>([]);
  const [previewed, setPreviewed] = useState<{ key: string; outcome: ActionResult<{ folders: string[][]; songs: number }> } | null>(
    null,
  );
  const { pending, result, run, stateOf } = useAction();

  const children = folders.filter(
    (folder) => folder.path.length === path.length + 1 && keyOf(folder.path.slice(0, -1)) === keyOf(path),
  );

  // How many songs the open folder would add; a stale answer is not shown.
  const pathKey = keyOf(path);
  const preview = previewed?.key === pathKey ? previewed.outcome : null;
  useEffect(() => {
    if (path.length === 0) return;
    let current = true;
    previewSheetMusicSourceAction(path).then((outcome) => {
      if (current) setPreviewed({ key: pathKey, outcome });
    });
    return () => {
      current = false;
    };
    // pathKey stands for `path`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  function add() {
    // The browser closes once the folder is added (its list reloads the page), so a toast says which.
    void run(() => addSheetMusicSourceAction(typeId, path), { refresh: false, toast: true, onOk: () => onDone(true) });
  }

  return (
    <div className="space-y-3 rounded-card border border-line p-3 sm:p-4">
      <p className="text-xs font-medium text-muted">Choose a source folder for {typeLabel}</p>
      <nav aria-label="Folder" className="flex flex-wrap items-center gap-x-1 text-sm">
        {["Sheet Music", ...path].map((name, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden className="text-muted">›</span> : null}
            {index === path.length ? (
              <span className="text-ink">{name}</span>
            ) : (
              <button type="button" onClick={() => setPath(path.slice(0, index))} className="text-muted hover:text-ink">
                {name}
              </button>
            )}
          </span>
        ))}
      </nav>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line">
        {children.map((folder) => (
          <li key={keyOf(folder.path)}>
            <button
              type="button"
              onClick={() => setPath(folder.path)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-paper sm:px-4"
            >
              <FolderIcon />
              <span className="min-w-0 flex-1 truncate text-ink">{folder.path[folder.path.length - 1]}</span>
              <span className="shrink-0 text-xs text-muted">{count(folder.files, "file", "files")}</span>
            </button>
          </li>
        ))}
        {children.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted">
            {path.length === 0 ? "No folders found." : "No more folders inside. PDF and MuseScore files are included automatically."}
          </li>
        ) : null}
      </ul>
      {path.length > 0 ? (
        <p className="text-xs text-muted">
          {preview === null
            ? "Checking this folder…"
            : preview.ok
              ? `This folder and everything in it: ${count(preview.value.songs, "song", "songs")}.`
              : preview.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          state={stateOf()}
          pendingLabel={feedbackContent.adding}
          doneLabel={feedbackContent.added}
          disabled={path.length === 0 || !preview?.ok}
          onClick={add}
        >
          Choose this folder
        </Button>
        <Button type="button" variant="quiet" disabled={pending} onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
      <ActionMessage result={result} />
    </div>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} className="shrink-0 text-muted">
      <path d="M1.5 4.5v8h13v-6.5H7.5L6 4.5H1.5z" strokeLinejoin="round" />
    </svg>
  );
}
