"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { setServiceAvailability } from "@/app/availability/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { availabilityContent } from "@/content/availability";
import type { BoardService } from "@/lib/availability/board";
import { NOTE_LIMIT, type ExceptionStatus } from "@/lib/availability/effective";
import { serviceDay, serviceLine, stateLabel } from "@/lib/availability/format";

import { Dialog } from "./Dialog";
import { StateMark, StatePill } from "./parts";

const copy = availabilityContent;

export interface Subject {
  id: string;
  name: string;
  isSelf: boolean;
}

type Result = { ok: boolean; message?: string; error?: string } | null;

/**
 * One whole service: the subject's own choice (Available, Unavailable or
 * Normal), an optional note the whole team sees, then who differs from
 * normal and who is expected.
 */
export function ServiceDialog({
  service,
  editable,
  subject,
  onClose,
}: {
  service: BoardService;
  editable: boolean;
  subject: Subject | null;
  onClose: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const own = service.subject;
  // Two choices only. Whether one is an exception follows from their normal
  // services: choosing the usual one simply clears any exception.
  const [choice, setChoice] = useState<ExceptionStatus>(own?.effective ? "available" : "unavailable");
  const [note, setNote] = useState(own?.note ?? "");
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = Boolean(subject && own && editable);
  const usual: ExceptionStatus = own?.normal ? "available" : "unavailable";
  const choices: Array<{ value: ExceptionStatus; label: string }> = [
    { value: "available", label: copy.service.choices.available },
    { value: "unavailable", label: copy.service.choices.unavailable },
  ];
  // The usual choice keeps no exception, so it has no note either.
  const isChange = choice !== usual;

  function save() {
    if (!subject) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await setServiceAvailability({
        date: service.date,
        slot: service.slot,
        status: choice,
        note: isChange ? note : "",
        userId: subject.isSelf ? undefined : subject.id,
      });
      setResult(outcome);
      if (outcome.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <Dialog
      title={serviceDay(service)}
      subtitle={serviceLine(service)}
      closeLabel={copy.service.close}
      onClose={onClose}
      footer={
        canEdit ? (
          <>
            <div className="mr-auto">
              <ActionMessage result={result} />
            </div>
            <Button type="button" variant="secondary" onClick={onClose}>
              {copy.service.close}
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? copy.service.saving : copy.service.save}
            </Button>
          </>
        ) : null
      }
    >
      {subject && own ? (
        <section>
          <h3 className="text-sm font-medium text-ink">
            {subject.isSelf ? copy.service.yourStatus : copy.service.theirStatus.replace("{name}", subject.name)}
          </h3>
          {canEdit ? (
            <>
              <fieldset className="mt-3">
                <legend className="sr-only">
                  {subject.isSelf ? copy.service.yourStatus : copy.service.theirStatus.replace("{name}", subject.name)}
                </legend>
                <div className="grid gap-2">
                  {choices.map((option) => {
                    const checked = choice === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition-colors",
                          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/40",
                          checked ? "border-ink bg-paper text-ink" : "border-line text-ink-soft hover:border-gold",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${ids}-choice`}
                          value={option.value}
                          checked={checked}
                          onChange={() => setChoice(option.value)}
                          className="accent-[var(--color-ink)]"
                        />
                        <StateMark
                          state={
                            option.value === "available"
                              ? own.normal
                                ? "normally-available"
                                : "available-by-exception"
                              : own.normal
                                ? "unavailable-by-exception"
                                : "normally-unavailable"
                          }
                        />
                        {option.label}
                        {option.value === usual ? (
                          <span className="ml-auto text-xs text-muted">{copy.service.usual}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {isChange ? (
                <div className="mt-4">
                  <p className="mb-3 text-xs text-muted">{copy.service.exceptionHint}</p>
                  <TextField
                    id={`${ids}-note`}
                    label={copy.service.note}
                    hint={copy.service.noteHint}
                    placeholder={copy.service.notePlaceholder}
                    value={note}
                    maxLength={NOTE_LIMIT}
                    onChange={setNote}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <StatePill state={own.state} long />
              {own.note ? <p className="text-sm text-ink-soft">“{own.note}”</p> : null}
              {!editable ? <p className="text-sm text-muted">{copy.past}</p> : null}
            </div>
          )}
        </section>
      ) : !editable ? (
        <p className="text-sm text-muted">{copy.past}</p>
      ) : null}

      <section>
        <h3 className="text-sm font-medium text-ink">{copy.service.changes}</h3>
        {service.changes.length > 0 ? (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {service.changes.map((person) => (
              <li key={person.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">{person.name}</span>
                  <StatePill state={person.state} />
                </div>
                {person.note ? <p className="mt-1 text-xs text-muted">“{person.note}”</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">{copy.service.noChanges}</p>
        )}
      </section>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-ink marker:text-muted">
          {copy.service.expected.replace("{count}", String(service.expected.length))}
        </summary>
        {service.expected.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {service.expected.map((person) => (
              <li
                key={person.id}
                title={stateLabel(person.state)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink"
              >
                <StateMark state={person.state} />
                {person.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{copy.service.nobodyExpected}</p>
        )}
      </details>
    </Dialog>
  );
}
