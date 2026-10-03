"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { deleteSpecialService, publishServices, saveService, setServiceStatus } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Notice } from "@/components/account/Notices";
import { Pill } from "@/components/admin/StatusPill";
import { SongLink } from "@/components/song-list/SongLink";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { useFlip } from "@/components/ui/use-flip";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";
import { churchTimeOf, progressLabel, serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import {
  candidateSheetMusicCheck,
  serviceSignals,
  type CandidateSong,
  type PlanningSignal,
  type ServiceAvailability,
} from "@/lib/service-planner/intelligence";
import { isInsert, type PlannerService, type PlanSlots } from "@/lib/service-planner/model";
import type { PlanEvent } from "@/lib/service-planner/store";
import { formatAgo, formatChurchTime, formatShortDate } from "@/lib/service-time";
import type { DatedService } from "@/types/song-list";

import { Disclosure, Panel } from "./Panel";
import { SongPicker, type ChosenSong } from "./SongPicker";

const copy = servicePlannerContent;
const ws = copy.workspace;

/** The keys offered as you type; any other key ("C Dorian") can still be typed. */
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_OPTIONS = [...KEYS, ...KEYS.map((key) => `${key}m`)];

export interface WorkspaceProps {
  now: number;
  service: Omit<PlannerService, "plan">;
  revision: number | null;
  /** Stored, and never published - can be deleted outright (special services only). */
  deletable: boolean;
  locked: boolean;
  candidates: CandidateSong[];
  recentPast: DatedService[];
  planned: Array<{ startsAt: string; songs: Array<{ title: string }> }>;
  sheetMusicChecked: boolean;
  availability: ServiceAvailability | null;
  events: Array<PlanEvent & { actorName: string | null }>;
}

/**
 * The planning workspace for one service: its songs, in order, with their
 * keys - the page is mostly this list. Changes stay here until saved; the
 * checks beside it follow every change as it is made.
 */
export function Workspace(props: WorkspaceProps) {
  const { service, locked, candidates, now } = props;
  const router = useRouter();
  const [slots, setSlots] = useState<PlanSlots>(service.slots);
  const [label, setLabel] = useState(service.label ?? "");
  const [time, setTime] = useState(churchTimeOf(service.startsAt));
  const [picker, setPicker] = useState<{ index: number; replacing: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [conflict, setConflict] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  useFlip(listRef, slots);

  const status = service.status;
  const editable = !locked && status !== "cancelled";
  const initial = useMemo(
    () => JSON.stringify([service.slots, service.label ?? "", churchTimeOf(service.startsAt)]),
    [service],
  );
  const dirty = JSON.stringify([slots, label, time]) !== initial;
  const filled = slots.filter(Boolean).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const candidateMap = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const signals = useMemo(
    () =>
      serviceSignals({
        service: { startsAt: service.startsAt, date: service.date, slots },
        past: props.recentPast,
        planned: props.planned,
        sheetMusic: props.sheetMusicChecked ? candidateSheetMusicCheck(candidateMap) : null,
      }),
    [slots, service.startsAt, service.date, props.recentPast, props.planned, props.sheetMusicChecked, candidateMap],
  );

  // --- editing -------------------------------------------------------------

  const update = (next: PlanSlots) => {
    setResult(null);
    setSlots(next);
  };
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };
  const choose = (index: number, song: ChosenSong) => {
    const next = [...slots];
    // Replacing the insert keeps it the service's insert - unless a hymn from
    // the hymnal takes its place, which is never an insert.
    next[index] = { ...song, insert: (slots[index]?.insert ?? false) && song.number === null };
    update(next);
    setPicker(null);
  };
  const setKey = (index: number, key: string) => {
    const song = slots[index];
    if (!song) return;
    update(slots.map((item, at) => (at === index ? { ...song, key: key.trim() === "" ? null : key } : item)));
  };

  // --- saving --------------------------------------------------------------

  function run(action: () => Promise<ActionResult<unknown>>) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      if (!outcome.ok && outcome.error === ws.conflict) setConflict(true);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  const save = (publish: boolean) =>
    run(() =>
      // Nothing changed: publishing alone, so the history records no empty edit.
      publish && !dirty
        ? publishServices({ anchors: [service.anchor] })
        : saveService({
            anchor: service.anchor,
            revision: props.revision,
            slots,
            label: label.trim() === "" ? null : label.trim(),
            time,
            publish,
          }),
    );

  const title = serviceTitle({ slot: service.slot, startsAt: service.startsAt, label: label.trim() || service.label });

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <RehearsalMark>{copy.title}</RehearsalMark>
          <h1 className="text-balance font-display text-4xl text-ink sm:text-5xl">{title}</h1>
          <p className="mt-3 text-lg text-muted">
            {serviceFullDate(service.startsAt)} · {formatChurchTime(service.startsAt)}
          </p>
        </div>
        <Pill tone={status === "published" ? "strong" : status === "draft" ? "warning" : "muted"}>
          {copy.status[status]}
        </Pill>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {locked ? <Notice className="mb-6">{ws.locked}</Notice> : null}
          {status === "cancelled" ? <Notice className="mb-6">{ws.cancelledNotice}</Notice> : null}
          {conflict ? (
            <Notice tone="warning" className="mb-6">
              {ws.conflict}{" "}
              <button
                type="button"
                className="font-medium text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
                onClick={() => router.refresh()}
              >
                {ws.reload}
              </button>
            </Notice>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
              <h2 className="font-display text-xl text-ink">{ws.songs}</h2>
              <span className="text-sm text-muted">{progressLabel(filled, slots.length)}</span>
            </div>

            <ol ref={listRef} className="divide-y divide-line">
              {slots.map((song, index) => (
                <li
                  key={song ? `${song.title}-${index}` : `empty-${index}`}
                  data-flip={song ? `song-${song.title}` : `empty-${index}`}
                  // On a phone a song's key and buttons take a second line
                  // under its title, so the title keeps the width; from `sm`
                  // it is all one line.
                  className={cn(
                    "relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 sm:flex sm:gap-4 sm:px-5",
                    song && isInsert(song) && "bg-paper/40",
                  )}
                >
                  {song && isInsert(song) ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-gold" /> : null}
                  <span className="tnum w-6 shrink-0 text-center text-sm text-muted">{index + 1}</span>

                  {song ? (
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex items-baseline gap-x-2.5">
                        <span className="tnum w-9 shrink-0 text-right font-display text-base text-gold-dark">
                          {song.number ?? <span aria-hidden="true">·</span>}
                        </span>
                        <span className="min-w-0">
                          <SongLink title={song.title} className="text-[0.98rem] font-medium text-ink" />
                          {isInsert(song) ? (
                            <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold-dark">
                              {ws.insert}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  ) : editable ? (
                    <button
                      type="button"
                      onClick={() => setPicker({ index, replacing: null })}
                      className="group flex min-h-11 min-w-0 flex-1 items-center gap-x-2.5 text-left text-[0.95rem] text-muted transition-colors hover:text-ink"
                    >
                      {/* In the number column, so "Choose a song" lines up with the titles. */}
                      <span aria-hidden="true" className="flex w-9 shrink-0 justify-end">
                        <span className="grid size-6 place-items-center rounded-full border border-dashed border-staff text-sm leading-none transition-colors group-hover:border-gold group-hover:text-gold-dark">
                          +
                        </span>
                      </span>
                      {ws.chooseSong}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 py-2.5 text-[0.95rem] italic text-muted">{ws.empty}</span>
                  )}

                  <div
                    className={cn(
                      "flex items-center gap-2 sm:contents",
                      // Under the title, from where the title starts.
                      song && "col-span-2 col-start-2 justify-between pl-[2.875rem]",
                    )}
                  >
                    {song ? (
                      <>
                        <label htmlFor={`key-${index}`} className="sr-only">
                          {ws.keyFor.replace("{title}", song.title)}
                        </label>
                        <input
                          id={`key-${index}`}
                          list="planner-keys"
                          value={song.key ?? ""}
                          disabled={!editable}
                          placeholder={ws.key}
                          autoComplete="off"
                          onChange={(event) => setKey(index, event.target.value)}
                          className="tnum h-9 w-16 shrink-0 rounded-md border border-line bg-surface px-2 text-center text-sm font-medium text-ink transition-colors placeholder:text-muted hover:border-muted/50 disabled:opacity-70"
                        />
                      </>
                    ) : null}

                    {editable ? (
                      <div className="flex shrink-0 items-center">
                        <IconButton label={ws.moveUp} disabled={index === 0} onClick={() => move(index, -1)}>
                          <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
                        </IconButton>
                        <IconButton label={ws.moveDown} disabled={index === slots.length - 1} onClick={() => move(index, 1)}>
                          <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
                        </IconButton>
                        {song ? (
                          <>
                            <IconButton label={ws.replace} onClick={() => setPicker({ index, replacing: song.title })}>
                              {/* The pencil of the admin editors (PencilIcon, OptionListEditor.tsx). */}
                              <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
                            </IconButton>
                            <IconButton label={ws.remove} onClick={() => update(slots.map((item, at) => (at === index ? null : item)))}>
                              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                            </IconButton>
                          </>
                        ) : (
                          <IconButton label={ws.removePlace} onClick={() => update(slots.filter((_, at) => at !== index))}>
                            <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" />
                          </IconButton>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            {editable ? (
              <div className="border-t border-line px-5 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => update([...slots, null])}
                  disabled={slots.length >= 20}
                  className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
                >
                  <span aria-hidden="true">+</span> {ws.addPlace}
                </button>
              </div>
            ) : null}
          </Card>
          <datalist id="planner-keys">
            {KEY_OPTIONS.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>

          {editable ? (
            <div className="sticky bottom-4 z-10 mt-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 shadow-lift sm:px-5">
                {/* Its own line on a phone, so it is never squeezed behind the buttons. */}
                <div className="min-w-0 basis-full text-sm sm:basis-auto sm:flex-1">
                  {result ? (
                    <ActionMessage result={result} />
                  ) : dirty ? (
                    <span className="inline-flex items-center gap-2 text-gold-dark">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                      {ws.unsaved}
                    </span>
                  ) : (
                    <span className="text-muted">
                      {status === "published" ? ws.publishedState : status === "draft" ? ws.draftState : ws.newState}
                    </span>
                  )}
                </div>
                <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                  {status === "published" ? (
                    <Button type="button" onClick={() => save(false)} disabled={pending || !dirty}>
                      {ws.saveChanges}
                    </Button>
                  ) : (
                    <>
                      {dirty ? (
                        <Button type="button" variant="secondary" onClick={() => save(false)} disabled={pending}>
                          {ws.save}
                        </Button>
                      ) : null}
                      <Button type="button" onClick={() => save(true)} disabled={pending}>
                        {dirty ? ws.saveAndPublish : ws.publish}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : result ? (
            <div className="mt-6">
              <ActionMessage result={result} />
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Checks signals={signals} sheetMusicChecked={props.sheetMusicChecked} serviceStartsAt={service.startsAt} />
          <Availability availability={props.availability} date={service.date} />

          {editable ? (
            <Panel title={ws.details} lead={ws.detailsLead} collapsible>
              <div className="space-y-4">
                <Field id="service-label" label={ws.name}>
                  <input
                    id="service-label"
                    value={label}
                    maxLength={80}
                    placeholder={serviceTitle({ slot: service.slot, startsAt: service.startsAt, label: null })}
                    onChange={(event) => setLabel(event.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </Field>
                <Field id="service-time" label={ws.time}>
                  <input
                    id="service-time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </Field>
                <p className="text-xs text-muted">{ws.detailsHint}</p>
              </div>
            </Panel>
          ) : null}

          {!locked ? (
            <Panel title={ws.manage}>
              <div className="grid gap-2">
                {status === "published" ? (
                  <Link href={`/song-list#${service.anchor}`} className={buttonClasses("secondary", "md", "w-full")}>
                    {ws.viewOnSongList}
                  </Link>
                ) : null}
                <a
                  href={`/service-planner/export?format=formatted-pdf&services=${service.anchor}&drafts=1`}
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  {ws.exportPdf}
                </a>
                {status === "published" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={pending}
                    onClick={() => run(() => setServiceStatus({ anchor: service.anchor, status: "draft" }))}
                  >
                    {ws.unpublish}
                  </Button>
                ) : null}
                {status === "cancelled" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={pending}
                    onClick={() => run(() => setServiceStatus({ anchor: service.anchor, status: "draft" }))}
                  >
                    {ws.restore}
                  </Button>
                ) : props.deletable ? (
                  <Button
                    type="button"
                    variant="quiet"
                    className="w-full"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const outcome = await deleteSpecialService({ anchor: service.anchor });
                        if (outcome.ok) router.push("/service-planner");
                        return outcome;
                      })
                    }
                  >
                    {ws.deleteSpecial}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="quiet"
                    className="w-full"
                    disabled={pending}
                    onClick={() => run(() => setServiceStatus({ anchor: service.anchor, status: "cancelled" }))}
                  >
                    {ws.cancelService}
                  </Button>
                )}
              </div>
              {status === "published" ? <p className="mt-3 text-xs text-muted">{ws.unpublishHint}</p> : null}
            </Panel>
          ) : null}

          <History events={props.events} />
        </aside>
      </div>

      {picker ? (
        <SongPicker
          candidates={candidates}
          serviceStartsAt={service.startsAt}
          now={now}
          title={picker.replacing ? copy.picker.replaceTitle.replace("{title}", picker.replacing) : copy.picker.title}
          onChoose={(song) => choose(picker.index, song)}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink disabled:pointer-events-none disabled:opacity-25"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

/** Which checks are worth a second look (gold) rather than simply worth knowing. */
const NOTABLE = new Set<PlanningSignal["kind"]>(["duplicate", "recently-sung", "sheet-music-gap", "out-of-season"]);

/** The service's checks, in words. They inform; nothing here stops a save. */
function Checks({
  signals,
  sheetMusicChecked,
  serviceStartsAt,
}: {
  signals: PlanningSignal[];
  sheetMusicChecked: boolean;
  serviceStartsAt: string;
}) {
  const c = copy.checks;
  const start = Date.parse(serviceStartsAt);
  const words = (signal: PlanningSignal): string => {
    switch (signal.kind) {
      case "duplicate":
        return c.duplicate.replace("{title}", signal.title);
      case "recently-sung":
        return c.recentlySung.replace("{title}", signal.title).replace("{ago}", formatAgo(Date.parse(signal.at), start));
      case "planned-nearby":
        return c.plannedNearby.replace("{title}", signal.title).replace("{date}", formatShortDate(signal.at));
      case "repeated-pair":
        return c.repeatedPair
          .replace("{a}", signal.titles[0])
          .replace("{b}", signal.titles[1])
          .replace("{date}", formatShortDate(signal.at));
      case "out-of-season":
        return c.outOfSeason.replace("{title}", signal.title);
      case "no-sheet-music-entry":
        return c.noSheetEntry.replace("{title}", signal.title);
      case "sheet-music-gap":
        return c.sheetGap.replace("{title}", signal.title).replace("{people}", signal.people.join(", "));
      case "empty-places":
        return signal.count === 1 ? c.emptyPlace : c.emptyPlaces.replace("{count}", String(signal.count));
    }
  };

  return (
    <Panel title={c.title}>
      {signals.length === 0 ? (
        <p className="text-sm text-muted">{c.none}</p>
      ) : (
        <ul className="space-y-2.5 text-sm" aria-live="polite">
          {signals.map((signal, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={cn("mt-[0.45rem] size-1.5 shrink-0 rounded-full", NOTABLE.has(signal.kind) ? "bg-gold" : "bg-staff")}
              />
              <span className={NOTABLE.has(signal.kind) ? "text-ink" : "text-ink-soft"}>{words(signal)}</span>
            </li>
          ))}
        </ul>
      )}
      {!sheetMusicChecked ? <p className="mt-3 text-xs text-muted">{c.unavailableIndex}</p> : null}
    </Panel>
  );
}

function Availability({ availability, date }: { availability: ServiceAvailability | null; date: string }) {
  const a = copy.availability;
  return (
    <Panel
      title={a.title}
      aside={
        <Link
          href={`/availability?month=${date.slice(0, 7)}`}
          className="group inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          {a.open}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      }
    >
      {!availability ? (
        <p className="text-sm text-muted">{a.unavailable}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <Disclosure summary={a.expected.replace("{count}", String(availability.expected.length))}>
            <p className="text-muted">{availability.expected.map((person) => person.name).join(", ") || a.nobody}</p>
          </Disclosure>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{a.away}</p>
            {availability.away.length === 0 ? (
              <p className="mt-1 text-muted">{a.noneAway}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {availability.away.map((person) => (
                  <li key={person.id} className="text-ink">
                    {person.name}
                    {person.note ? <span className="text-muted"> - {person.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {availability.extra.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{a.extra}</p>
              <ul className="mt-1 space-y-1">
                {availability.extra.map((person) => (
                  <li key={person.id} className="text-ink">
                    {person.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function History({ events }: { events: Array<PlanEvent & { actorName: string | null }> }) {
  const h = copy.history;
  if (events.length === 0) return null;
  return (
    <Panel title={h.title} collapsible>
      <ol className="space-y-3 text-sm">
        {events.map((event, index) => (
          <li key={index}>
            <p className="text-ink">{(h as Record<string, string>)[event.type] ?? event.type}</p>
            <p className="text-xs text-muted">
              {h.by.replace("{name}", event.actorName ?? h.someone)} · {formatShortDate(event.at)}
            </p>
            {event.changes.length > 0 ? (
              <p className="mt-0.5 text-xs text-ink-soft">{event.changes.map(describeChange).join(" · ")}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function describeChange(change: PlanEvent["changes"][number]): string {
  switch (change.type) {
    case "added":
      return `+ ${change.title}`;
    case "removed":
      return `− ${change.title}`;
    case "moved":
      return `${change.title} ${change.from} → ${change.to}`;
    case "key":
      return `${change.title}: ${change.from ?? "–"} → ${change.to ?? "–"}`;
  }
}
