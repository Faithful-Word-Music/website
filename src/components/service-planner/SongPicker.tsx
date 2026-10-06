"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { createSong } from "@/app/service-planner/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { servicePlannerContent } from "@/content/service-planner";
import { siteConfig } from "@/config/site";
import type { SongSuggestion } from "@/lib/ai/service-planner/protocol";
import { candidateFacts, type CandidateSong } from "@/lib/service-planner/intelligence";
import { pickerResults } from "@/lib/service-planner/picker";
import { formatAgo, formatShortDate } from "@/lib/service-time";

import { SparkleIcon } from "./AiGenerate";
import type { PlanAiOutcome } from "./ai-request";

const copy = servicePlannerContent;

export interface ChosenSong {
  title: string;
  number: string | null;
  key: string | null;
}

/**
 * Choosing a song for a service: type a title or hymn number and pick. Each
 * result carries what matters for planning - when it was last sung, how
 * often, what is already planned, its keys and its sheet music - looking
 * from the service being planned. A song not found can be added on the spot.
 *
 * With nothing typed, it lists familiar songs not sung for the longest, as
 * a starting point. Which songs are listed, typed for or not, is
 * pickerResults() (src/lib/service-planner/picker.ts): in a service that has
 * its insert already the starting list leaves other inserts out, and on the
 * Inserts page only inserts are listed at all.
 *
 * Follows the ARIA combobox pattern, as the site search does: arrows move
 * through the results and Enter picks the highlighted one. Typing highlights
 * the best match; the starting list highlights nothing until an arrow does,
 * so a stray Enter picks no song.
 */
export function SongPicker({
  candidates,
  serviceStartsAt,
  now,
  title,
  onChoose,
  onClose,
  ai,
  only,
  hideInsertSuggestions = false,
}: {
  candidates: CandidateSong[];
  serviceStartsAt: string;
  now: number;
  title: string;
  onChoose: (song: ChosenSong) => void;
  onClose: () => void;
  /** The Inserts page: only songs that can be an insert are listed. */
  only?: "inserts";
  /** A service that has its insert already: the starting list leaves inserts out. Typing still finds them. */
  hideInsertSuggestions?: boolean;
  /** Suggest with AI, where the picker is choosing for a place in a service and the person may use AI. */
  ai?: SuggestWithAi;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  // Straight into the search box once the dialog has opened (and back from
  // adding a song) - with a mouse and keyboard. On a touch screen that would
  // throw up the keyboard over the suggestions before anyone asked for it.
  useEffect(() => {
    if (!adding && window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus({ preventScroll: true });
  }, [adding]);

  const results = useMemo(
    () =>
      pickerResults(candidates, query, { serviceStartsAt, only, hideInsertSuggestions }).map((candidate) => ({
        candidate,
        facts: candidateFacts(candidate, serviceStartsAt),
      })),
    [candidates, query, serviceStartsAt, only, hideInsertSuggestions],
  );

  const activeIndex = Math.min(active, results.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  // Keep the highlighted song in view as the arrows move it.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on listId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function choose({ candidate, facts }: (typeof results)[number]) {
    onChoose({ title: candidate.title, number: candidate.number, key: facts.suggestedKey });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = results.length;
    if (count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex <= 0 ? count - 1 : activeIndex - 1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  return (
    <Modal title={adding ? copy.newSong.title : title} closeLabel={copy.picker.close} onClose={onClose}>
      {adding ? (
        <NewSongForm
          initialTitle={/^\s*#?\d/.test(query) ? "" : query.trim()}
          onCreated={(song) => onChoose(song)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        // One child of the dialog's body, so its own spacing rules leave the margins here alone.
        <div className="flex flex-col">
          {/* Stays put while the list scrolls under it, so what was typed is always in sight.
              -top-5: sticking is measured inside the body's padding, which this covers. */}
          <div className="sticky -top-5 z-10 -mx-2 -mt-5 bg-surface px-2 pb-3 pt-5">
            <label htmlFor="song-search" className="sr-only">
              {copy.picker.searchLabel}
            </label>
            <input
              id="song-search"
              ref={searchRef}
              type="search"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              autoComplete="off"
              value={query}
              placeholder={copy.picker.search}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(event.target.value.trim() === "" ? -1 : 0);
              }}
              onKeyDown={onKeyDown}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted"
            />
          </div>

          {ai ? <AiSuggestions ai={ai} serviceStartsAt={serviceStartsAt} onChoose={onChoose} /> : null}

          {results.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{copy.picker.noResults.replace("{query}", query.trim())}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={copy.picker.searchLabel} className="-mx-2 mt-3 divide-y divide-line">
              {results.map(({ candidate, facts }, i) => (
                <li key={candidate.id} role="presentation">
                  <button
                    type="button"
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    tabIndex={-1}
                    // Move, not enter: a row scrolling under a resting pointer keeps the arrows' highlight.
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose({ candidate, facts })}
                    className={cn(
                      "relative flex w-full scroll-mt-24 flex-col gap-1 rounded-lg px-3 py-3 text-left transition-colors",
                      i === activeIndex ? "bg-gold/10" : "hover:bg-gold/5",
                    )}
                  >
                    {/* The site's barline marker, on the highlighted row. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-0.5 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full transition-colors",
                        i === activeIndex ? "bg-gold" : "bg-transparent",
                      )}
                    />
                    <span className="flex flex-wrap items-baseline gap-2">
                      {candidate.number ? <span className="text-sm tabular-nums text-muted">{candidate.number}</span> : null}
                      <span className="font-medium text-ink">{candidate.title}</span>
                      {facts.suggestedKey ? <span className="text-sm text-muted">· {facts.suggestedKey}</span> : null}
                      {candidate.christmas ? <Pill tone="muted">{copy.picker.christmas}</Pill> : null}
                      {candidate.isNew ? <Pill tone="muted">{copy.picker.newSong}</Pill> : null}
                    </span>
                    <span className="text-xs text-muted">
                      {[
                        facts.lastSung
                          ? copy.picker.lastSung.replace("{ago}", formatAgo(Date.parse(facts.lastSung), Date.parse(serviceStartsAt)))
                          : copy.picker.neverSung,
                        facts.lastYear > 0 ? copy.picker.usesYear.replace("{count}", String(facts.lastYear)) : null,
                        facts.upcoming.find((at) => Date.parse(at) > now)
                          ? copy.picker.upcoming.replace("{date}", formatShortDate(facts.upcoming.find((at) => Date.parse(at) > now)!))
                          : null,
                        facts.recentKeys.length > 1 ? copy.picker.keys.replace("{keys}", facts.recentKeys.join(", ")) : null,
                        candidate.collection && candidate.collection !== siteConfig.sheetMusic.hymnalCollection
                          ? candidate.collection
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className={cn("text-xs", candidate.sheetMusic === "complete" ? "text-muted" : "text-gold-dark")}>
                      {copy.picker.sheet[candidate.sheetMusic]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim() !== "" ? (
            <Button type="button" variant="secondary" onClick={() => setAdding(true)} className="mt-6 w-full">
              {copy.picker.createNew.replace("{query}", query.trim())}
            </Button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export interface SuggestWithAi {
  /** The song in this place is AI-locked: nothing is suggested until it is unlocked. */
  locked: boolean;
  suggest: (signal: AbortSignal) => Promise<PlanAiOutcome<"replace">>;
}

/**
 * Suggest with AI: a few songs for this place, chosen from the rest of the
 * service as it stands, the planning philosophy and the history. A suggestion
 * is picked like any other song in the list; nothing is put in until it is.
 */
function AiSuggestions({
  ai,
  serviceStartsAt,
  onChoose,
}: {
  ai: SuggestWithAi;
  serviceStartsAt: string;
  onChoose: (song: ChosenSong) => void;
}) {
  const words = copy.ai.suggest;
  const { result, run, stateOf } = useAction();
  const [suggestions, setSuggestions] = useState<SongSuggestion[] | null>(null);
  const request = useRef<AbortController | null>(null);
  // Leaving the picker stops the request.
  const stop = useCallback(() => request.current?.abort(), []);
  useEffect(() => stop, [stop]);

  if (ai.locked) return <p className="mt-1 text-xs text-muted">{words.lockedHint}</p>;

  const suggest = () => {
    const controller = new AbortController();
    request.current = controller;
    void run(() => ai.suggest(controller.signal), {
      refresh: false,
      onOk: (outcome) => {
        if (outcome.ok) setSuggestions(outcome.suggestions);
      },
    });
  };

  return (
    <div className="mt-1">
      <Button
        type="button"
        variant="secondary"
        className="min-h-9 w-full px-4"
        state={stateOf()}
        pendingLabel={words.pending}
        doneLabel={words.done}
        onClick={suggest}
      >
        <SparkleIcon className="text-gold-dark" />
        {suggestions ? words.again : words.button}
      </Button>
      {result && !result.ok ? (
        <div className="mt-2">
          <ActionMessage result={result} />
        </div>
      ) : null}

      {suggestions ? (
        <section aria-label={words.heading} className="-mx-2 mt-3 border-b border-line pb-2">
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{words.heading}</p>
          <ul className="mt-1">
            {suggestions.map((song) => (
              <li key={song.title}>
                <button
                  type="button"
                  onClick={() => onChoose({ title: song.title, number: song.number, key: song.key })}
                  className="flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left transition-colors hover:bg-gold/5"
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    {song.number ? <span className="text-sm tabular-nums text-muted">{song.number}</span> : null}
                    <span className="font-medium text-ink">{song.title}</span>
                    {song.key ? <span className="text-sm text-muted">· {song.key}</span> : null}
                  </span>
                  {song.reason ? <span className="text-sm text-ink-soft">{song.reason}</span> : null}
                  <span className="text-xs text-muted">
                    {song.lastSung
                      ? copy.picker.lastSung.replace("{ago}", formatAgo(Date.parse(song.lastSung), Date.parse(serviceStartsAt)))
                      : copy.picker.neverSung}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Adds a song the Library does not have yet - just enough to plan it. */
function NewSongForm({
  initialTitle,
  onCreated,
  onCancel,
}: {
  initialTitle: string;
  onCreated: (song: ChosenSong) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [number, setNumber] = useState("");
  const [collection, setCollection] = useState("");
  const [key, setKey] = useState("");
  const { result, run, stateOf } = useAction();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        // The picker closes with the new song chosen, so a toast says it was added.
        void run(() => createSong({ title, number, collection, defaultKey: key }), {
          refresh: false,
          toast: true,
          onOk: (outcome) => {
            if (outcome.ok) onCreated(outcome.value);
          },
        });
      }}
    >
      <p className="text-sm text-muted">{copy.newSong.lead}</p>
      <TextField id="new-song-title" label={copy.newSong.songTitle} value={title} maxLength={200} onChange={setTitle} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="new-song-number"
          label={copy.newSong.number}
          hint={copy.newSong.numberHint}
          value={number}
          maxLength={20}
          onChange={setNumber}
        />
        <TextField id="new-song-key" label={copy.newSong.defaultKey} value={key} maxLength={30} onChange={setKey} />
      </div>
      <TextField
        id="new-song-collection"
        label={copy.newSong.collection}
        placeholder={copy.newSong.collectionPlaceholder}
        value={collection}
        maxLength={120}
        onChange={setCollection}
      />
      <ActionMessage result={result} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onCancel}>
          {copy.special.cancel}
        </Button>
        <Button
          type="submit"
          state={stateOf()}
          pendingLabel={feedbackContent.adding}
          doneLabel={feedbackContent.added}
          disabled={title.trim() === ""}
        >
          {copy.newSong.create}
        </Button>
      </div>
    </form>
  );
}
