"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createSong } from "@/app/service-planner/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Dialog } from "@/components/availability/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { servicePlannerContent } from "@/content/service-planner";
import { siteConfig } from "@/config/site";
import type { ActionResult } from "@/lib/auth/session";
import { inChristmasSeason } from "@/lib/church-calendar";
import { candidateFacts, type CandidateSong } from "@/lib/service-planner/intelligence";
import { formatAgo, formatShortDate } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";

const copy = servicePlannerContent;
const LIMIT = 60;

export interface ChosenSong {
  title: string;
  number: string | null;
  key: string | null;
}

/** How well a song matches what was typed: lower is better, null is no match. */
export function matchRank(candidate: Pick<CandidateSong, "title" | "number" | "id">, query: string): number | null {
  const typed = query.trim().toLowerCase();
  if (typed === "") return 0;
  const number = typed.replace(/^(#|no\.?)\s*/, "");
  if (/^\d+[a-z]?$/.test(number) && candidate.number) {
    const own = candidate.number.toLowerCase();
    if (own === number) return 0;
    if (own.startsWith(number)) return 1;
  }
  const key = songKey(typed);
  if (key === "") return null;
  if (candidate.id === key) return 1;
  if (candidate.id.startsWith(key)) return 2;
  if (candidate.id.includes(key)) return 3;
  return null;
}

/**
 * Choosing a song for a service: type a title or hymn number and pick. Each
 * result carries what matters for planning - when it was last sung, how
 * often, what is already planned, its keys and its sheet music - looking
 * from the service being planned. A song not found can be added on the spot.
 *
 * With nothing typed, it lists familiar songs not sung for the longest, as
 * a starting point.
 */
export function SongPicker({
  candidates,
  serviceStartsAt,
  now,
  title,
  onChoose,
  onClose,
}: {
  candidates: CandidateSong[];
  serviceStartsAt: string;
  now: number;
  title: string;
  onChoose: (song: ChosenSong) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // After the dialog opens (showModal moves focus to its first control), straight into the search box.
  useEffect(() => {
    if (!adding) searchRef.current?.focus();
  }, [adding]);

  const results = useMemo(() => {
    if (query.trim() === "") {
      // Familiar songs, longest unsung first - Christmas songs only in their season.
      const season = inChristmasSeason(serviceStartsAt.slice(0, 10));
      return candidates
        .filter((candidate) => candidate.playCount >= 3 && (season || !candidate.christmas))
        .map((candidate) => ({ candidate, facts: candidateFacts(candidate, serviceStartsAt) }))
        .sort((a, b) => (a.facts.lastSung ?? "").localeCompare(b.facts.lastSung ?? ""))
        .slice(0, LIMIT);
    }
    return candidates
      .map((candidate) => ({ candidate, rank: matchRank(candidate, query) }))
      .filter((item): item is { candidate: CandidateSong; rank: number } => item.rank !== null)
      .sort((a, b) => a.rank - b.rank || b.candidate.playCount - a.candidate.playCount || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, LIMIT)
      .map(({ candidate }) => ({ candidate, facts: candidateFacts(candidate, serviceStartsAt) }));
  }, [candidates, query, serviceStartsAt]);

  return (
    <Dialog title={adding ? copy.newSong.title : title} closeLabel={copy.picker.close} onClose={onClose}>
      {adding ? (
        <NewSongForm
          initialTitle={/^\s*#?\d/.test(query) ? "" : query.trim()}
          onCreated={(song) => onChoose(song)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <>
          <div>
            <label htmlFor="song-search" className="sr-only">
              {copy.picker.searchLabel}
            </label>
            <input
              id="song-search"
              ref={searchRef}
              type="search"
              autoComplete="off"
              value={query}
              placeholder={copy.picker.search}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0] && query.trim() !== "") {
                  event.preventDefault();
                  const { candidate, facts } = results[0];
                  onChoose({ title: candidate.title, number: candidate.number, key: facts.suggestedKey });
                }
              }}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted"
            />
          </div>

          {results.length === 0 ? (
            <p className="text-sm text-muted">{copy.picker.noResults.replace("{query}", query.trim())}</p>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {results.map(({ candidate, facts }) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => onChoose({ title: candidate.title, number: candidate.number, key: facts.suggestedKey })}
                    className="flex w-full flex-col gap-1 rounded-lg px-2 py-3 text-left transition-colors hover:bg-paper focus-visible:bg-paper"
                  >
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
            <Button type="button" variant="secondary" onClick={() => setAdding(true)} className="w-full">
              {copy.picker.createNew.replace("{query}", query.trim())}
            </Button>
          ) : null}
        </>
      )}
    </Dialog>
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
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => {
          const outcome = await createSong({ title, number, collection, defaultKey: key });
          setResult(outcome);
          if (outcome.ok) onCreated(outcome.value);
        });
      }}
    >
      <p className="text-sm text-muted">{copy.newSong.lead}</p>
      <TextField id="new-song-title" label={copy.newSong.songTitle} value={title} maxLength={200} onChange={setTitle} />
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Button type="submit" disabled={pending || title.trim() === ""}>
          {copy.newSong.create}
        </Button>
      </div>
    </form>
  );
}
