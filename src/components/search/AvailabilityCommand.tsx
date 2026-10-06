"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { feedbackContent } from "@/content/feedback";
import { searchContent } from "@/content/search";
import type { AvailabilityChoice } from "@/lib/availability/effective";
import { NOTE_LIMIT } from "@/lib/availability/effective";
import { serviceDay, serviceLine, stateLabel, stateShort } from "@/lib/availability/format";
import { choicesFor, matchMyServices, type MyService } from "@/lib/availability/quick";
import { formatChurchTime } from "@/lib/service-time";

const copy = searchContent.availability;
const ENDPOINT = "/api/account/availability";

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; onBoard: boolean; services: MyService[] };

/** "Morning service · 10:30 AM", or a special service by the name the planner gave it. */
function serviceDetail(service: MyService): string {
  return service.label ? `${service.label} · ${formatChurchTime(service.startsAt)}` : serviceLine(service);
}

async function readServices(): Promise<Loaded> {
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; onBoard?: boolean; services?: MyService[] } | null;
    if (!response.ok || !body?.ok) return { status: "error", message: body?.error || copy.loadError };
    return { status: "ready", onBoard: body.onBoard === true, services: Array.isArray(body.services) ? body.services : [] };
  } catch {
    return { status: "error", message: copy.loadError };
  }
}

/**
 * "Update my availability…", inside the site search: choose one of your
 * coming services, then say whether you will be there. A command, not a link
 * to the Availability page - it is done without leaving the page you are on.
 *
 * It shows and changes ONLY your own availability, through
 * /api/account/availability, which checks view_availability itself and
 * writes with the Availability page's own function. Which services are
 * listed, how you stand for each and which choices are offered all come from
 * src/lib/availability (quick.ts): nothing about availability is decided
 * here. Managing someone else's stays on the Availability page.
 *
 * The palette's Escape comes here first (`escapeRef`): from a service back to
 * the list, from the list back to the search.
 */
export function AvailabilityCommand({
  onExit,
  onClose,
  escapeRef,
}: {
  /** Back to the search. */
  onExit: () => void;
  /** Close the palette altogether. */
  onClose: () => void;
  /** Where the palette looks for what Escape should do while this is showing. */
  escapeRef: RefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const idPrefix = useId();
  const listId = `${idPrefix}-services`;
  const [data, setData] = useState<Loaded>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<MyService | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<AvailabilityChoice | null>(null);
  /** What the last change came to: said above the list once it is saved, and beside the choices when it is not. */
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    void readServices().then((loaded) => {
      if (current) setData(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  const back = useCallback(() => {
    if (saving) return;
    if (chosen) {
      setChosen(null);
      setResult(null);
    } else onExit();
  }, [chosen, saving, onExit]);

  // The palette owns the dialog and so hears Escape: it asks here what the key means just now.
  useEffect(() => {
    escapeRef.current = back;
    return () => {
      escapeRef.current = null;
    };
  }, [escapeRef, back]);

  // Into whichever step is showing: the box to type in, or the first thing to press.
  useEffect(() => {
    if (chosen) firstChoiceRef.current?.focus({ preventScroll: true });
    else filterRef.current?.focus({ preventScroll: true });
  }, [chosen]);

  const services = useMemo(() => (data.status === "ready" ? matchMyServices(data.services, query) : []), [data, query]);
  const activeIndex = Math.min(active, services.length - 1);
  const optionId = (i: number) => `${idPrefix}-service-${i}`;

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on idPrefix, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function pick(service: MyService) {
    setResult(null);
    setNote(service.note ?? "");
    setChosen(service);
  }

  function onFilterKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = services.length;
    if (count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex <= 0 ? count - 1 : activeIndex - 1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      pick(services[activeIndex]);
    }
  }

  async function save(service: MyService, status: AvailabilityChoice) {
    setSaving(status);
    setResult(null);
    let outcome: { ok: boolean; message?: string; error?: string };
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        // A note only means something beside a change from your usual.
        body: JSON.stringify({ date: service.date, slot: service.slot, status, ...(status === "normal" ? {} : { note }) }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      outcome = response.ok && body?.ok ? { ok: true, message: body.message || feedbackContent.saved } : { ok: false, error: body?.error || feedbackContent.failed };
    } catch {
      outcome = { ok: false, error: feedbackContent.failed };
    }

    if (!outcome.ok) {
      setSaving(null);
      setResult(outcome);
      return;
    }
    // The list is read again, so it shows how the server now has it - not what this guessed.
    const loaded = await readServices();
    setData(loaded);
    setSaving(null);
    setChosen(null);
    setQuery("");
    setActive(0);
    setResult({ ok: true, message: `${serviceDay(service)}: ${outcome.message}` });
    // Whatever is open underneath (the Dashboard, the Availability page) shows it too.
    router.refresh();
  }

  const iconButton =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors not-disabled:hover:bg-paper not-disabled:hover:text-ink disabled:opacity-40";

  return (
    <>
      <div className="flex items-center gap-1 border-b border-line pl-1.5 pr-4">
        <button type="button" onClick={back} disabled={saving !== null} aria-label={copy.back} title={copy.back} className={iconButton}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {chosen ? (
          <p className="min-h-14 min-w-0 flex-1 content-center truncate text-base text-ink sm:text-[0.9375rem]">{copy.title}</p>
        ) : (
          <input
            ref={filterRef}
            type="text"
            role="combobox"
            aria-expanded={services.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label={copy.title}
            placeholder={copy.filter}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onFilterKeyDown}
            autoComplete="off"
            spellCheck={false}
            // 16px on phones, so iOS does not zoom in on focus.
            className="min-h-14 w-full min-w-0 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none sm:text-[0.9375rem]"
          />
        )}
        <button type="button" onClick={onClose} className={cn(iconButton, "-mr-2.5")}>
          <span className="sr-only">{searchContent.closeLabel}</span>
          <span aria-hidden="true" className="relative block h-4 w-4">
            <span className="absolute left-0 top-2 block h-px w-4 rotate-45 bg-current" />
            <span className="absolute left-0 top-2 block h-px w-4 -rotate-45 bg-current" />
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {chosen ? (
          <div className="space-y-4 px-3 py-3">
            <div>
              <p className="font-display text-xl text-ink">{serviceDay(chosen)}</p>
              <p className="mt-0.5 text-sm text-muted">{serviceDetail(chosen)}</p>
              <p className="mt-2 text-sm text-ink-soft">{copy.now.replace("{state}", stateLabel(chosen.state))}</p>
            </div>

            {choicesFor(chosen.state).some((choice) => choice !== "normal") ? (
              <div>
                <label htmlFor={`${idPrefix}-note`} className="mb-1.5 block text-sm font-medium text-ink">
                  {copy.note}
                </label>
                <input
                  id={`${idPrefix}-note`}
                  value={note}
                  maxLength={NOTE_LIMIT}
                  placeholder={copy.notePlaceholder}
                  disabled={saving !== null}
                  onChange={(event) => setNote(event.target.value)}
                  autoComplete="off"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted sm:text-sm"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {choicesFor(chosen.state).map((choice, i) => (
                <Button
                  key={choice}
                  ref={i === 0 ? firstChoiceRef : undefined}
                  type="button"
                  variant={choice === "normal" ? "secondary" : "primary"}
                  disabled={saving !== null}
                  aria-busy={saving === choice || undefined}
                  onClick={() => void save(chosen, choice)}
                >
                  {saving === choice ? copy.saving : copy.options[choice]}
                </Button>
              ))}
            </div>
            {result && !result.ok ? <ActionMessage result={result} /> : null}
          </div>
        ) : (
          <>
            {result?.ok ? (
              <div className="px-3 pb-1 pt-2">
                <ActionMessage result={result} />
              </div>
            ) : null}

            {data.status === "loading" ? <p className="px-3 py-3 text-sm text-muted">{copy.loading}</p> : null}
            {data.status === "error" ? (
              <p role="alert" className="px-3 py-3 text-sm text-gold-dark">
                {data.message}
              </p>
            ) : null}
            {data.status === "ready" && !data.onBoard ? <p className="px-3 py-3 text-sm text-muted">{copy.notOnBoard}</p> : null}
            {data.status === "ready" && data.onBoard && data.services.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">{copy.none}</p>
            ) : null}
            {data.status === "ready" && data.services.length > 0 && services.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">{copy.noMatch.replace("{query}", query.trim())}</p>
            ) : null}

            <div id={listId} role="listbox" aria-label={copy.title}>
              {services.map((service, i) => {
                const changed = service.state === "available-by-exception" || service.state === "unavailable-by-exception";
                return (
                  <button
                    key={`${service.date}-${service.slot}`}
                    type="button"
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    tabIndex={-1}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(service)}
                    className={cn(
                      "relative flex min-h-11 w-full items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-left transition-colors",
                      i === activeIndex ? "bg-gold/10" : "hover:bg-gold/5",
                    )}
                  >
                    {/* The site's barline marker, on the highlighted row. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-colors",
                        i === activeIndex ? "bg-gold" : "bg-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{serviceDay(service)}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{serviceDetail(service)}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs", changed ? "font-semibold text-gold-dark" : "text-muted")}>
                      <span className="sr-only">, </span>
                      {stateShort(service.state)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Keyboard hints: for keyboards, so not on phones. */}
      <div aria-hidden="true" className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-muted sm:flex">
        {chosen ? null : (
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-line px-1 py-px font-sans text-[0.7rem] leading-none">↵</kbd>
            {copy.hints.choose}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-line px-1 py-px font-sans text-[0.7rem] leading-none">Esc</kbd>
          {copy.hints.back}
        </span>
      </div>
    </>
  );
}
