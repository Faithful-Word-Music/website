"use client";

import { useRouter } from "next/navigation";

import { replayIntroduction } from "@/app/profile/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";

/** Starts the optional walkthrough (notifications, the Dashboard) again. Nothing saved is touched. */
export function ReplayIntroduction() {
  const router = useRouter();
  const { result, run, stateOf } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="quiet"
        state={stateOf()}
        pendingLabel={feedbackContent.saving}
        doneLabel={feedbackContent.saved}
        onClick={() => void run(replayIntroduction, { refresh: false, onOk: () => router.push("/welcome") })}
      >
        {profileSetupContent.welcome.intro.replay}
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}
