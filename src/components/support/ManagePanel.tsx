"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { updateSupportWorkflowAction } from "@/app/contact/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { supportContent } from "@/content/support";
import { PRIORITIES, STATUSES, WAITING_ON, canMove, isActive, type Priority, type Status, type WaitingOn } from "@/lib/support/model";

const copy = supportContent.manage;
const selectClasses = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink transition-colors hover:border-muted/50";

/**
 * A manager's controls for one request: status, priority, who has it and who
 * it waits on, saved together against the revision the page was read at.
 * If someone else changed the request meanwhile, nothing is saved and the
 * page is read again.
 */
export function ManagePanel({
  publicId,
  revision,
  status,
  priority,
  waitingOn,
  assigneeId,
  managers,
  viewerId,
}: {
  publicId: string;
  revision: number;
  status: Status;
  priority: Priority;
  waitingOn: WaitingOn;
  assigneeId: string | null;
  managers: Array<{ id: string; name: string }>;
  viewerId: string;
}) {
  const id = useId();
  const router = useRouter();
  const [next, setNext] = useState({ status, priority, waitingOn, assigneeId });
  const { pending, result, run, stateOf, clear } = useAction();
  const changed = next.status !== status || next.priority !== priority || next.waitingOn !== waitingOn || next.assigneeId !== assigneeId;
  const statuses = STATUSES.filter((item) => item === status || canMove(status, item));
  const people = assigneeId && !managers.some((person) => person.id === assigneeId) ? [...managers, { id: assigneeId, name: `${assigneeId} (${copy.notManager})` }] : managers;

  const save = (values: typeof next, key: string) =>
    run(
      async () => {
        const outcome = await updateSupportWorkflowAction({
          publicId,
          expectedRevision: revision,
          status: values.status,
          priority: values.priority,
          // Leaving the active statuses clears it on the server; only send it while it means something.
          ...(isActive(values.status) ? { waitingOn: values.waitingOn } : {}),
          assigneeId: values.assigneeId,
        });
        if (!outcome.ok) router.refresh();
        return outcome;
      },
      { key },
    );

  const field = (label: string, control: React.ReactNode, htmlFor: string) => (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {control}
    </div>
  );

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 id={`${id}-heading`} className="font-display text-xl text-ink">
        {copy.heading}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {field(
          copy.status,
          <select
            id={`${id}-status`}
            value={next.status}
            onChange={(event) => {
              const chosen = event.target.value as Status;
              // Reopening waits on the music ministry, as the server would decide.
              setNext({ ...next, status: chosen, waitingOn: isActive(chosen) && !isActive(next.status) ? "management" : next.waitingOn });
              clear();
            }}
            className={selectClasses}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {supportContent.statuses[item]}
              </option>
            ))}
          </select>,
          `${id}-status`,
        )}
        {field(
          copy.priority,
          <select
            id={`${id}-priority`}
            value={next.priority}
            onChange={(event) => {
              setNext({ ...next, priority: event.target.value as Priority });
              clear();
            }}
            className={selectClasses}
          >
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {supportContent.priorities[item]}
              </option>
            ))}
          </select>,
          `${id}-priority`,
        )}
        {field(
          copy.assignee,
          <select
            id={`${id}-assignee`}
            value={next.assigneeId ?? ""}
            onChange={(event) => {
              setNext({ ...next, assigneeId: event.target.value || null });
              clear();
            }}
            className={selectClasses}
          >
            <option value="">{copy.nobody}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>,
          `${id}-assignee`,
        )}
        {isActive(next.status)
          ? field(
              copy.waitingOn,
              <select
                id={`${id}-waiting`}
                value={next.waitingOn}
                onChange={(event) => {
                  setNext({ ...next, waitingOn: event.target.value as WaitingOn });
                  clear();
                }}
                className={selectClasses}
              >
                {WAITING_ON.map((item) => (
                  <option key={item} value={item}>
                    {copy.waitingOptions[item]}
                  </option>
                ))}
              </select>,
              `${id}-waiting`,
            )
          : null}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending || !changed} state={stateOf("save")} pendingLabel={copy.saving} doneLabel={copy.saved} onClick={() => save(next, "save")}>
          {copy.save}
        </Button>
        {assigneeId !== viewerId && isActive(status) ? (
          <Button type="button" variant="secondary" disabled={pending} state={stateOf("claim")} onClick={() => save({ status, priority, waitingOn, assigneeId: viewerId }, "claim")}>
            {copy.claim}
          </Button>
        ) : null}
      </div>
      <div className="mt-3">
        <ActionMessage result={result} />
      </div>
    </section>
  );
}
