"use client";

import { useId, useState } from "react";

import { setRangeAvailability } from "@/app/availability/actions";
import { ActionMessage, ChoiceChips, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { availabilityContent } from "@/content/availability";
import { feedbackContent } from "@/content/feedback";
import { NOTE_LIMIT, type AvailabilityChoice } from "@/lib/availability/effective";
import { serviceShort } from "@/lib/availability/format";
import { addDays, type Occurrence } from "@/lib/availability/occurrences";
import { occurrencesInRange } from "@/lib/availability/range";
import { plural } from "@/lib/plural";

import type { Subject } from "./ServiceDialog";

const copy = availabilityContent;

/**
 * "Unavailable October 15-22": one form for every service in a range. It
 * shows which services it covers before saving; the server works the list
 * out again for itself and stores one exception per service.
 */
export function RangeButton({
  occurrences,
  today,
  now,
  subject,
}: {
  /** Upcoming services, for the preview. */
  occurrences: Occurrence[];
  today: string;
  /** When the page was rendered: services that have started are not offered. */
  now: number;
  subject: Subject;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <CalendarIcon />
        {copy.range.open}
      </Button>
      {open ? (
        <RangeDialog occurrences={occurrences} today={today} now={now} subject={subject} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function RangeDialog({
  occurrences,
  today,
  now,
  subject,
  onClose,
}: {
  occurrences: Occurrence[];
  today: string;
  now: number;
  subject: Subject;
  onClose: () => void;
}) {
  const ids = useId();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 7));
  const [status, setStatus] = useState<AvailabilityChoice>("unavailable");
  const [note, setNote] = useState("");
  const { result, run, stateOf } = useAction();

  const covered = from && to && from <= to ? occurrencesInRange(occurrences, from, to, now) : [];
  const preview = covered.slice(0, 6).map(serviceShort).join(", ") + (covered.length > 6 ? ", …" : "");

  function save() {
    // The dialog closes on saving, so a toast says how many services were saved.
    void run(
      () =>
        setRangeAvailability({
          from,
          to,
          status,
          note: status === "normal" ? "" : note,
          userId: subject.isSelf ? undefined : subject.id,
        }),
      { toast: true, onOk: onClose },
    );
  }

  return (
    <Modal
      title={copy.range.title}
      subtitle={subject.isSelf ? copy.range.lead : copy.managing.banner.replace("{name}", subject.name)}
      closeLabel={copy.service.close}
      onClose={onClose}
      footer={
        <>
          <div className="mr-auto">
            <ActionMessage result={result} />
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.service.close}
          </Button>
          <Button
            type="button"
            state={stateOf()}
            pendingLabel={feedbackContent.saving}
            doneLabel={feedbackContent.saved}
            onClick={save}
            disabled={covered.length === 0}
          >
            {copy.range.save}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField id={`${ids}-from`} label={copy.range.from} value={from} min={today} onChange={setFrom} />
        <DateField id={`${ids}-to`} label={copy.range.to} value={to} min={from || today} onChange={setTo} />
      </div>

      <ChoiceChips
        name={`${ids}-status`}
        legend={copy.range.status}
        options={[
          { value: "unavailable" as const, label: copy.service.choices.unavailable },
          { value: "available" as const, label: copy.service.choices.available },
          // Not a third availability: it removes the range's exceptions, for
          // undoing a range entered by mistake.
          { value: "normal" as const, label: copy.range.clear },
        ]}
        selected={[status]}
        onChange={(next) => setStatus(next[0] ?? status)}
      />

      {status !== "normal" ? (
        <TextField
          id={`${ids}-note`}
          label={copy.service.note}
          hint={copy.service.noteHint}
          placeholder={copy.service.notePlaceholder}
          value={note}
          maxLength={NOTE_LIMIT}
          onChange={setNote}
        />
      ) : null}

      <p role="status" className="rounded-lg border-l-2 border-gold bg-[color-mix(in_srgb,var(--color-gold)_8%,transparent)] px-3 py-2 text-sm text-ink">
        {covered.length === 0
          ? copy.range.none
          : plural(copy.range.covers, covered.length).replace("{list}", preview)}
      </p>
    </Modal>
  );
}

function DateField({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink transition-colors hover:border-muted/50"
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5.5 1.75v2.5M10.5 1.75v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
