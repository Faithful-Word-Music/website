"use client";

import { extendProfileDeadlineAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";

/** "Give 7 more days" on a person's admin page - the way to unstick someone. */
export function ExtendDeadlineButton({ userId }: { userId: string }) {
  const { result, run, stateOf, pending } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        state={stateOf()}
        pendingLabel={feedbackContent.saving}
        doneLabel={feedbackContent.saved}
        disabled={pending}
        onClick={() => void run(() => extendProfileDeadlineAction(userId))}
      >
        {profileSetupContent.admin.person.extend}
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}
