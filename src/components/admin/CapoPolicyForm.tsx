"use client";

import { useState } from "react";

import { setCapoPolicyAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { MAX_ACCIDENTALS, type CapoPolicy } from "@/lib/capo-policy";

const field =
  "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-muted/50";

/** A threshold as its select holds it: a count, or "off". */
const toValue = (count: number | null) => (count === null ? "off" : String(count));
const fromValue = (value: string) => (value === "off" ? null : Number(value));

const COUNTS = Array.from({ length: MAX_ACCIDENTALS }, (_, index) => index + 1);

/**
 * When a song needs capo sheet music (src/lib/capo-policy.ts): from how many
 * flats, from how many sharps - either can be switched off - and which sheet
 * music type is the capo one. One song can be set apart on its own page.
 */
export function CapoPolicyForm({ policy, types }: { policy: CapoPolicy; types: Array<{ id: number; label: string }> }) {
  const [flats, setFlats] = useState(toValue(policy.minFlats));
  const [sharps, setSharps] = useState(toValue(policy.minSharps));
  const [typeId, setTypeId] = useState(policy.typeId === null ? "" : String(policy.typeId));
  const { pending, result, clear, run, stateOf } = useAction();

  const changed =
    flats !== toValue(policy.minFlats) ||
    sharps !== toValue(policy.minSharps) ||
    typeId !== (policy.typeId === null ? "" : String(policy.typeId));
  const set = (setter: (value: string) => void) => (value: string) => {
    clear();
    setter(value);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run(() =>
          setCapoPolicyAction({
            minFlats: fromValue(flats),
            minSharps: fromValue(sharps),
            typeId: typeId === "" ? null : Number(typeId),
          }),
        );
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Threshold id="capo-flats" label="Flats" unit={["flat", "flats"]} value={flats} onChange={set(setFlats)} />
        <Threshold id="capo-sharps" label="Sharps" unit={["sharp", "sharps"]} value={sharps} onChange={set(setSharps)} />
        <div>
          <label htmlFor="capo-type" className="mb-1.5 block text-sm font-medium text-ink">
            Capo sheet music type
          </label>
          <select id="capo-type" value={typeId} onChange={(event) => set(setTypeId)(event.target.value)} className={field}>
            <option value="">None - never ask for it</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          state={stateOf()}
          pendingLabel={feedbackContent.saving}
          doneLabel={feedbackContent.saved}
          disabled={pending || !changed}
        >
          Save
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}

function Threshold({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: [string, string];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={field}>
        {COUNTS.map((count) => (
          <option key={count} value={count}>
            {count === 1 ? `Any ${unit[0]} (1 or more)` : `${count} ${unit[1]} or more`}
          </option>
        ))}
        <option value="off">Off - never for {unit[1]}</option>
      </select>
    </div>
  );
}
