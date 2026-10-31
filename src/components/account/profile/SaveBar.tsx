import type { ReactNode } from "react";

import { CheckIcon } from "@/components/ui/StatusIcons";
import { profileSetupContent } from "@/content/profile-setup";

const copy = profileSetupContent.sections;

/**
 * The foot of a form: set apart from the questions by a hairline, so the
 * button that saves never reads as one more answer chip.
 *
 *   nothing changed    a quiet "All changes saved" - no button to mistake
 *   something changed  "Unsaved changes" on the left, the button on the right
 *
 * The outcome of the last save (ActionMessage) sits on the left too.
 */
export function SaveBar({
  dirty,
  busy,
  message,
  button,
}: {
  dirty: boolean;
  /** Saving, or just saved: the button stays so its "Saving…" / "Saved" can be read. */
  busy: boolean;
  message: ReactNode;
  button: ReactNode;
}) {
  const showButton = dirty || busy;
  return (
    <div className="mt-8 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1" aria-live="polite">
        {dirty && !busy ? (
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-gold-dark" />
            {copy.unsaved}
          </p>
        ) : !showButton ? (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CheckIcon className="text-gold-dark" />
            {copy.allSaved}
          </p>
        ) : null}
        {message}
      </div>
      {showButton ? <div className="shrink-0">{button}</div> : null}
    </div>
  );
}
