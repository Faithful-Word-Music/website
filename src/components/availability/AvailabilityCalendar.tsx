"use client";

import { useState } from "react";

import { cn } from "@/components/ui/cn";
import { availabilityContent } from "@/content/availability";
import type { BoardService, BoardView } from "@/lib/availability/board";
import { changeCount, serviceDay, serviceName, stateLabel, stateShort } from "@/lib/availability/format";
import { monthRange } from "@/lib/availability/occurrences";
import { dayOfWeek } from "@/lib/service-time";

import { ChangeBadge, StateMark, StatePill, stateTone } from "./parts";
import { ServiceDialog, type Subject } from "./ServiceDialog";

const copy = availabilityContent;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarService = BoardService & { editable: boolean };

/**
 * The month's services. Only service days carry anything: each service shows
 * the subject's own state (quiet when normal) and, under Everyone, how many
 * people differ from normal. Choosing a service opens its dialog.
 *
 * md and wider: a month grid. Phones: the same services as an agenda list -
 * a seven-column grid is unusable at that width.
 */
export function AvailabilityCalendar({
  month,
  services,
  today,
  view,
  subject,
}: {
  month: string;
  services: CalendarService[];
  today: string;
  view: BoardView;
  subject: Subject | null;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = services.find((service) => service.key === openKey) ?? null;

  return (
    <>
      <MonthGrid month={month} services={services} today={today} view={view} onOpen={setOpenKey} />
      <Agenda services={services} today={today} view={view} onOpen={setOpenKey} />
      <Legend view={view} />

      {open ? (
        <ServiceDialog
          key={open.key}
          service={open}
          editable={open.editable}
          subject={subject}
          onClose={() => setOpenKey(null)}
        />
      ) : null}
    </>
  );
}

/** What a service's button says to a screen reader. */
function serviceLabel(service: CalendarService, view: BoardView): string {
  const parts = [`${serviceDay(service)}, ${serviceName(service)}`];
  if (service.subject) parts.push(stateLabel(service.subject.state));
  if (view === "everyone" && service.changes.length > 0) parts.push(changeCount(service.changes.length));
  return parts.join(": ");
}

function MonthGrid({
  month,
  services,
  today,
  view,
  onOpen,
}: {
  month: string;
  services: CalendarService[];
  today: string;
  view: BoardView;
  onOpen: (key: string) => void;
}) {
  const { from, to } = monthRange(month);
  const daysInMonth = Number(to.slice(8));
  const lead = dayOfWeek(from);
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const byDate = new Map<string, CalendarService[]>();
  for (const service of services) byDate.set(service.date, [...(byDate.get(service.date) ?? []), service]);

  return (
    <div className="hidden overflow-hidden rounded-card border border-line bg-surface shadow-card md:block">
      <div className="grid grid-cols-7 border-b border-line bg-paper">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, index) => {
          const dayServices = date ? (byDate.get(date) ?? []) : [];
          const isToday = date === today;
          const isPast = date !== null && date < today;
          return (
            <div
              key={date ?? `blank-${index}`}
              className={cn(
                "min-h-28 border-line p-1.5 lg:min-h-32",
                index % 7 !== 6 && "border-r",
                index < cells.length - 7 && "border-b",
                !date && "bg-[color-mix(in_srgb,var(--color-paper)_60%,transparent)]",
                dayServices.length === 0 && date && "bg-[color-mix(in_srgb,var(--color-paper)_40%,transparent)]",
              )}
            >
              {date ? (
                <>
                  <p
                    className={cn(
                      "tnum mb-1 inline-grid size-7 place-items-center rounded-full text-sm",
                      isToday ? "bg-ink font-semibold text-paper" : isPast ? "text-muted/70" : "text-ink-soft",
                    )}
                  >
                    {Number(date.slice(8))}
                  </p>
                  <ul className="space-y-1">
                    {dayServices.map((service) => (
                      <li key={service.key}>
                        <ServiceChip service={service} view={view} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServiceChip({
  service,
  view,
  onOpen,
}: {
  service: CalendarService;
  view: BoardView;
  onOpen: (key: string) => void;
}) {
  const state = service.subject?.state ?? null;
  const changes = view === "everyone" ? service.changes.length : 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(service.key)}
      aria-label={serviceLabel(service, view)}
      aria-haspopup="dialog"
      className={cn(
        "flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-xs transition-[border-color,box-shadow,transform]",
        "hover:border-gold hover:shadow-card active:scale-[0.98]",
        stateTone(state),
        !service.editable && "opacity-60",
      )}
    >
      <StateMark state={state} />
      <span className="tnum font-semibold">{service.slot}</span>
      {service.kind === "special" ? <span className="truncate text-[0.7rem] text-gold-dark">{copy.special}</span> : null}
      {state && state !== "normally-available" && service.kind !== "special" ? (
        // The mark already says it; the word only where a cell has room.
        <span className={cn("hidden truncate xl:inline", state === "unavailable-by-exception" && "line-through decoration-1")}>
          {stateShort(state)}
        </span>
      ) : null}
      <ChangeBadge count={changes} className="ml-auto" />
    </button>
  );
}

function Agenda({
  services,
  today,
  view,
  onOpen,
}: {
  services: CalendarService[];
  today: string;
  view: BoardView;
  onOpen: (key: string) => void;
}) {
  if (services.length === 0) return <p className="text-muted md:hidden">{copy.noServices}</p>;

  return (
    <ol className="space-y-2 md:hidden">
      {services.map((service) => {
        const state = service.subject?.state ?? null;
        const changes = view === "everyone" ? service.changes : [];
        const [weekday, , day] = serviceDay(service).replace(",", "").split(" ");
        return (
          <li key={service.key}>
            <button
              type="button"
              onClick={() => onOpen(service.key)}
              aria-label={serviceLabel(service, view)}
              aria-haspopup="dialog"
              className={cn(
                "flex w-full items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-gold",
                !service.editable && "opacity-60",
                service.date === today && "border-l-2 border-l-gold",
              )}
            >
              <span className="w-11 shrink-0 text-center">
                <span className="block font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold-dark">
                  {weekday.slice(0, 3)}
                </span>
                <span className="tnum block font-display text-2xl leading-none text-ink">{day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{serviceName(service)}</span>
                {changes.length > 0 ? (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {changes.map((person) => `${person.name} (${stateShort(person.state).toLowerCase()})`).join(", ")}
                  </span>
                ) : null}
              </span>
              {state ? <StatePill state={state} className="shrink-0" /> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Legend({ view }: { view: BoardView }) {
  const items = [
    { state: "normally-available" as const, label: copy.legend.normal },
    { state: "unavailable-by-exception" as const, label: copy.legend.away },
    { state: "available-by-exception" as const, label: copy.legend.extra },
    { state: "normally-unavailable" as const, label: copy.legend.off },
  ];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      {items.map((item) => (
        <li key={item.state} className="inline-flex items-center gap-1.5">
          <StateMark state={item.state} />
          {item.label}
        </li>
      ))}
      {view === "everyone" ? (
        <li className="inline-flex items-center gap-1.5">
          <ChangeBadge count={2} />
          {copy.legend.changes}
        </li>
      ) : null}
    </ul>
  );
}
