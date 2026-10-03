"use client";

import { useId, useState } from "react";

import { setServiceAvailability } from "@/app/availability/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { availabilityContent } from "@/content/availability";
import { feedbackContent } from "@/content/feedback";
import type { BoardService } from "@/lib/availability/board";
import { NOTE_LIMIT, type ExceptionStatus } from "@/lib/availability/effective";
import { serviceDay, serviceLine, stateLabel } from "@/lib/availability/format";

import { StateMark, StatePill } from "./parts";

const copy = availabilityContent;

export interface Subject {
  id: string;
  name: string;
  isSelf: boolean;
}

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
  const own = service.subject;
  // Two choices only. Whether one is an exception follows from their normal
  // services: choosing the usual one simply clears any exception.
  const [choice, setChoice] = useState<ExceptionStatus>(own?.effective ? "available" : "unavailable");
  const [note, setNote] = useState(own?.note ?? "");
  const [showExpected, setShowExpected] = useState(false);
  const expectedId = `${ids}-expected`;
  const { result, run, stateOf } = useAction();

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
    // The dialog closes on saving, so a toast says "Saved."
    void run(
      () =>
        setServiceAvailability({
          date: service.date,
          slot: service.slot,
          status: choice,
          note: isChange ? note : "",
          userId: subject.isSelf ? undefined : subject.id,
        }),
      { toast: true, onOk: onClose },
    );
  }

  return (
    <Modal
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
            <Button
              type="button"
              state={stateOf()}
              pendingLabel={feedbackContent.saving}
              doneLabel={feedbackContent.saved}
              onClick={save}
            >
              {copy.service.save}
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

      <div>
        <button
          type="button"
          onClick={() => setShowExpected((value) => !value)}
          aria-expanded={showExpected}
          aria-controls={expectedId}
          className="inline-flex cursor-pointer items-center gap-2 text-left text-sm font-medium text-ink"
        >
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 12 12"
            className={cn("text-muted transition-transform duration-200", showExpected && "rotate-90")}
          >
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {copy.service.expected.replace("{count}", String(service.expected.length))}
        </button>
        <Collapse open={showExpected} id={expectedId}>
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
        </Collapse>
      </div>
    </Modal>
  );
}
