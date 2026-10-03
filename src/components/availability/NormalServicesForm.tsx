"use client";

import { useId, useState } from "react";

import { setNormalPattern } from "@/app/availability/actions";
import { ActionMessage, ChoiceChips } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAction } from "@/components/ui/use-action";
import { availabilityContent } from "@/content/availability";
import { feedbackContent } from "@/content/feedback";
import { SERVICE_AVAILABILITY, type ServiceAvailability } from "@/lib/auth/profile-options";

import type { Subject } from "./ServiceDialog";

const copy = availabilityContent.normal;

/**
 * The services someone usually serves at - the baseline every week starts
 * from. This is the one place it is edited (the profile only shows it).
 */
export function NormalServicesForm({ subject, initial }: { subject: Subject; initial: ServiceAvailability[] }) {
  const ids = useId();
  const [selected, setSelected] = useState(initial);
  const { result, clear, run, stateOf } = useAction();
  const changed = [...selected].sort().join() !== [...initial].sort().join();

  function save() {
    void run(() => setNormalPattern({ services: selected, userId: subject.isSelf ? undefined : subject.id }));
  }

  return (
    <Card className="p-5 sm:p-6">
      <section id="normal" aria-labelledby={`${ids}-title`} className="scroll-mt-24">
        <h2 id={`${ids}-title`} className="font-display text-xl text-ink">
          {subject.isSelf ? copy.title : copy.titleOther.replace("{name}", subject.name)}
        </h2>
        <p className="mt-1 text-sm text-muted">{subject.isSelf ? copy.lead : copy.leadOther}</p>
        <div className="mt-4">
          <ChoiceChips
            name={`${ids}-services`}
            legend={copy.legend}
            options={SERVICE_AVAILABILITY}
            selected={selected}
            multiple
            onChange={(next) => {
              setSelected(next);
              clear();
            }}
          />
        </div>
        {selected.length === 0 ? <p className="mt-3 text-xs text-muted">{copy.none}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            state={stateOf()}
            pendingLabel={feedbackContent.saving}
            doneLabel={feedbackContent.saved}
            onClick={save}
            disabled={!changed}
          >
            {copy.save}
          </Button>
          <ActionMessage result={result} />
        </div>
      </section>
    </Card>
  );
}
