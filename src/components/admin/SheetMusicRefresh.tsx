"use client";

import { refreshSheetMusicAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";

/**
 * Admin -> Configuration's "Refresh sheet music". The site reads the Sheet
 * Music Index and the Drive folders at most hourly; this reads them again now,
 * for a file just dropped into Drive or an edit to the Index.
 */
export function SheetMusicRefresh() {
  const { pending, result, run, stateOf } = useAction();

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="text-sm text-muted">
        The site reads the Sheet Music Index and the Drive folders once an hour. Refresh after adding or replacing
        files, or editing the Index, to show the changes now.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          state={stateOf()}
          pendingLabel="Refreshing…"
          doneLabel="Refreshed"
          disabled={pending}
          onClick={() => run(refreshSheetMusicAction)}
        >
          Refresh sheet music
        </Button>
        <ActionMessage result={result} />
      </div>
    </div>
  );
}
