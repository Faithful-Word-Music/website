"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { createSupportRequestAction, supportServiceSongsAction, supportSongFilesAction, supportSongSearchAction } from "@/app/contact/actions";
import { ActionMessage, ChoiceChips, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { supportContent } from "@/content/support";
import type { ContextInput } from "@/lib/support/context";
import { REQUEST_TYPES, SUPPORT_LIMITS, categoriesFor, contextKinds, type Category, type RequestType } from "@/lib/support/model";

const copy = supportContent.form;
const DRAFT_KEY = "fwm:support-draft";

export interface FormChoices {
  services: Array<{ anchor: string; name: string }>;
  leading: Array<{ anchor: string; name: string; positions: string }>;
}

export interface FormStart {
  type: RequestType | null;
  category: Category | null;
  /** References the page was opened with (from a "Report a problem" link), already checked. */
  context: ContextInput;
  /** How that context reads, when it was found. */
  contextLines: string[] | null;
  /** The link pointed at something that could not be found or seen. */
  contextProblem: "context" | "changed" | null;
}

type SongPick = { songId: string; label: string; position?: number; placeId?: string | null };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * One form for every kind of request. The four ways in choose the kinds on
 * offer; the kind chooses which "what is it about" questions appear, and
 * nothing else is shown. The context is only ever references - the server
 * checks each one and keeps what it found.
 *
 * The idempotency key is made when the form opens and kept until the request
 * is sent, so pressing Send twice, or a reply lost on the way back, records
 * one request.
 */
export function RequestForm({ start, choices }: { start: FormStart; choices: FormChoices }) {
  const router = useRouter();
  const id = useId();
  const [type, setType] = useState<RequestType | null>(start.type);
  const [category, setCategory] = useState<Category | null>(start.category);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [service, setService] = useState<string>(start.context.service ?? "");
  const [song, setSong] = useState<SongPick | null>(
    start.context.songId ? { songId: start.context.songId, label: "", position: start.context.position, placeId: start.context.placeId ?? null } : null,
  );
  const [file, setFile] = useState<string>(start.context.file ?? "");
  const [page, setPage] = useState<string>(start.context.page ?? "");
  const [linked, setLinked] = useState<string[] | null>(start.contextLines);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(
    start.contextProblem ? { ok: false, error: start.contextProblem === "changed" ? supportContent.errors.contextChanged : supportContent.errors.context } : null,
  );
  const [pending, setPending] = useState(false);
  const [restored, setRestored] = useState(false);
  const key = useRef<string>("");

  const activeType = type ?? (category ? REQUEST_TYPES.find((item) => categoriesFor(item).includes(category)) ?? null : null);
  const kinds = useMemo(() => (category ? contextKinds(category) : []), [category]);

  useEffect(() => {
    key.current = newKey();
    // A draft from this browser, if the person left one (never the context: that is checked afresh).
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as { title?: string; description?: string } | null;
      if (saved && (saved.title || saved.description)) {
        // Restored after hydration rather than in the initial state, so the first render matches the server's (as ContactForm does).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTitle(saved.title ?? "");
        setDescription(saved.description ?? "");
        setRestored(true);
      }
    } catch {
      // Storage unavailable: start empty.
    }
  }, []);

  useEffect(() => {
    try {
      if (title || description) window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description }));
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Not kept: nothing else depends on it.
    }
  }, [title, description]);

  const chooseType = (next: RequestType | null) => {
    setType(next);
    const options = next ? categoriesFor(next) : [];
    setCategory(options.length === 1 ? options[0] : null);
    setResult(null);
  };

  const context = (): ContextInput => {
    const input: ContextInput = {};
    const wantsService = kinds.some((kind) => kind === "service" || kind === "occurrence" || kind === "leadership");
    if (wantsService && service) input.service = service;
    if (kinds.includes("leadership") && service) input.leadership = true;
    if (song) {
      input.songId = song.songId;
      if (service && kinds.includes("occurrence")) {
        if (song.placeId) input.placeId = song.placeId;
        else if (song.position) input.position = song.position;
      }
    }
    if (file && kinds.includes("sheet_music")) input.file = file;
    if (page && kinds.includes("page")) input.page = page.trim();
    return input;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !category || !activeType) return;
    const problems: Record<string, string> = {};
    if (!title.trim() || title.trim().length > SUPPORT_LIMITS.titleChars) problems.title = supportContent.errors.title;
    if (!description.trim() || description.length > SUPPORT_LIMITS.descriptionChars) problems.description = supportContent.errors.description;
    if (links.some((link) => link.trim() && !/^https?:\/\/\S+$/i.test(link.trim()))) problems.links = supportContent.errors.link;
    if (category === "leader_assignment" && !service) problems.context = supportContent.errors.leadingRequired;
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setPending(true);
    setResult(null);
    try {
      if (!key.current) key.current = newKey();
      const outcome = await createSupportRequestAction({
        type: activeType,
        category,
        title,
        description,
        links: links.filter((link) => link.trim()),
        context: context(),
        submissionKey: key.current,
      });
      if (!outcome.ok) {
        setResult(outcome);
        return;
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clear.
      }
      key.current = newKey();
      if (outcome.message) toast(outcome.message);
      router.push(outcome.value.href);
    } catch {
      setResult({ ok: false, error: supportContent.errors.failed });
    } finally {
      setPending(false);
    }
  };

  // ---- 1. Which way in --------------------------------------------------------
  if (!activeType) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {result ? (
          <div className="sm:col-span-2">
            <ActionMessage result={result} />
          </div>
        ) : null}
        {REQUEST_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => chooseType(item)}
            className="flex flex-col items-start justify-start rounded-card border border-line bg-surface p-5 text-left shadow-card transition-colors hover:border-gold focus-visible:border-gold"
          >
            <span className="block font-display text-xl text-ink">{supportContent.entries[item].label}</span>
            <span className="mt-1.5 block text-sm text-muted">{supportContent.entries[item].detail}</span>
          </button>
        ))}
      </div>
    );
  }

  // ---- 2. The form ------------------------------------------------------------
  const categoryOptions = categoriesFor(activeType).map((value) => ({ value, label: supportContent.categories[value] }));
  return (
    <form onSubmit={submit} noValidate className="space-y-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl text-ink">{supportContent.entries[activeType].label}</h2>
        <Button type="button" variant="quiet" onClick={() => chooseType(null)} disabled={pending}>
          {copy.cancel}
        </Button>
      </div>
      {restored ? <p className="text-sm text-muted">{copy.draftRestored}</p> : null}

      {categoryOptions.length > 1 ? (
        <ChoiceChips
          name={`${id}-category`}
          legend={copy.whatKind}
          options={categoryOptions}
          selected={category ? [category] : []}
          onChange={(next) => {
            setCategory(next[0] ?? null);
            setResult(null);
          }}
        />
      ) : null}

      {category && linked ? (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{copy.contextFrom}</p>
            {linked.map((line) => (
              <p key={line} className="text-ink">
                {line}
              </p>
            ))}
          </div>
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setLinked(null);
              setService("");
              setSong(null);
              setFile("");
            }}
          >
            {copy.contextRemove}
          </Button>
        </div>
      ) : category && kinds.length > 0 ? (
        <ContextPickers
          kinds={kinds}
          choices={choices}
          service={service}
          setService={(next) => {
            setService(next);
            setSong(null);
          }}
          song={song}
          setSong={(next) => {
            setSong(next);
            setFile("");
          }}
          file={file}
          setFile={setFile}
          page={page}
          setPage={setPage}
          error={errors.context}
        />
      ) : null}

      {category ? (
        <>
          <TextField
            id={`${id}-title`}
            label={copy.titleLabel}
            placeholder={copy.titlePlaceholder}
            value={title}
            maxLength={SUPPORT_LIMITS.titleChars}
            error={errors.title}
            onChange={setTitle}
          />
          <div>
            <TextField
              id={`${id}-description`}
              label={copy.descriptionLabel}
              placeholder={copy.descriptionPlaceholder}
              value={description}
              maxLength={SUPPORT_LIMITS.descriptionChars}
              error={errors.description}
              multiline
              rows={6}
              onChange={setDescription}
            />
            <p className="mt-1 text-right text-xs tabular-nums text-muted">
              {copy.characterCount
                .replace("{count}", description.length.toLocaleString("en-US"))
                .replace("{limit}", SUPPORT_LIMITS.descriptionChars.toLocaleString("en-US"))}
            </p>
          </div>
          <LinksField links={links} setLinks={setLinks} error={errors.links} />
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <ActionMessage result={result} />
            <Button type="submit" state={pending ? "pending" : "idle"} pendingLabel={copy.submitting} className="sm:ml-auto">
              {copy.submit}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

function LinksField({ links, setLinks, error }: { links: string[]; setLinks: (next: string[]) => void; error?: string }) {
  const id = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{copy.linksLabel}</legend>
      <p className="mb-2 text-xs text-muted">{copy.linksHint}</p>
      <div className="space-y-2">
        {links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <label htmlFor={`${id}-${index}`} className="sr-only">
              {copy.linksLabel} {index + 1}
            </label>
            <input
              id={`${id}-${index}`}
              type="url"
              inputMode="url"
              value={link}
              maxLength={SUPPORT_LIMITS.linkChars}
              placeholder={copy.linkPlaceholder}
              onChange={(event) => setLinks(links.map((item, at) => (at === index ? event.target.value : item)))}
              className="min-h-11 w-full rounded-lg border border-line bg-surface px-4 text-base text-ink placeholder:text-muted"
            />
            <Button type="button" variant="secondary" onClick={() => setLinks(links.filter((_, at) => at !== index))} aria-label={copy.removeLink}>
              ×
            </Button>
          </div>
        ))}
      </div>
      {links.length < SUPPORT_LIMITS.links ? (
        <Button type="button" variant="quiet" className="mt-1 px-0" onClick={() => setLinks([...links, ""])}>
          {copy.addLink}
        </Button>
      ) : null}
      {error ? <p className="mt-1.5 text-sm text-gold-dark">{error}</p> : null}
    </fieldset>
  );
}

const selectClasses = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink transition-colors hover:border-muted/50";

function ContextPickers({
  kinds,
  choices,
  service,
  setService,
  song,
  setSong,
  file,
  setFile,
  page,
  setPage,
  error,
}: {
  kinds: readonly string[];
  choices: FormChoices;
  service: string;
  setService: (anchor: string) => void;
  song: SongPick | null;
  setSong: (song: SongPick | null) => void;
  file: string;
  setFile: (file: string) => void;
  page: string;
  setPage: (page: string) => void;
  error?: string;
}) {
  const id = useId();
  // Each answer is kept with what it answered, so a changed choice simply shows nothing until its own arrives.
  const [loadedSongs, setLoadedSongs] = useState<{ for: string; songs: SongPick[] } | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<{ for: string; files: Array<{ file: string; label: string }> } | null>(null);
  const wantsLeading = kinds.includes("leadership");
  const wantsService = kinds.includes("service") || kinds.includes("occurrence");
  const wantsOccurrence = kinds.includes("occurrence");
  const wantsSong = kinds.includes("song") || kinds.includes("sheet_music");
  const wantsFiles = kinds.includes("sheet_music");
  const serviceSongs = wantsOccurrence && service && loadedSongs?.for === service ? loadedSongs.songs : null;
  const files = wantsFiles && song && loadedFiles?.for === song.songId ? loadedFiles.files : null;

  useEffect(() => {
    if (!wantsOccurrence || !service) return;
    let live = true;
    void supportServiceSongsAction(service).then((outcome) => {
      if (!live) return;
      setLoadedSongs({
        for: service,
        songs: outcome.ok
          ? outcome.value.map((item) => ({
              songId: item.songId,
              position: item.position,
              placeId: item.placeId,
              label: `${item.position}. ${item.number ? `${item.number} · ` : ""}${item.title}${item.key ? ` (${item.key})` : ""}`,
            }))
          : [],
      });
    });
    return () => {
      live = false;
    };
  }, [service, wantsOccurrence]);

  const songId = song?.songId ?? null;
  useEffect(() => {
    if (!wantsFiles || !songId) return;
    let live = true;
    void supportSongFilesAction(songId).then((outcome) => {
      if (live) setLoadedFiles({ for: songId, files: outcome.ok ? outcome.value : [] });
    });
    return () => {
      live = false;
    };
  }, [songId, wantsFiles]);

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      {wantsLeading ? (
        <div>
          <label htmlFor={`${id}-leading`} className="mb-1.5 block text-sm font-medium text-ink">
            {copy.leadingLabel}
          </label>
          {choices.leading.length > 0 ? (
            <select id={`${id}-leading`} value={service} onChange={(event) => setService(event.target.value)} className={selectClasses}>
              <option value="">—</option>
              {choices.leading.map((item) => (
                <option key={item.anchor} value={item.anchor}>
                  {item.name} · {item.positions}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted">{copy.leadingNone}</p>
          )}
        </div>
      ) : null}

      {wantsService ? (
        <div>
          <label htmlFor={`${id}-service`} className="mb-1.5 block text-sm font-medium text-ink">
            {copy.serviceLabel}
          </label>
          <select id={`${id}-service`} value={service} onChange={(event) => setService(event.target.value)} className={selectClasses}>
            <option value="">{copy.serviceNone}</option>
            {choices.services.map((item) => (
              <option key={item.anchor} value={item.anchor}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {wantsOccurrence && service && serviceSongs ? (
        <div>
          <label htmlFor={`${id}-song`} className="mb-1.5 block text-sm font-medium text-ink">
            {copy.songLabel}
          </label>
          <select
            id={`${id}-song`}
            value={song ? `${song.position ?? ""}|${song.songId}` : ""}
            onChange={(event) => setSong(serviceSongs.find((item) => `${item.position ?? ""}|${item.songId}` === event.target.value) ?? null)}
            className={selectClasses}
          >
            <option value="">{copy.songNone}</option>
            {serviceSongs.map((item) => (
              <option key={`${item.position}|${item.songId}`} value={`${item.position ?? ""}|${item.songId}`}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {wantsSong && !(wantsOccurrence && service) ? <SongSearch song={song} setSong={setSong} /> : null}

      {kinds.includes("sheet_music") && song && files && files.length > 0 ? (
        <div>
          <label htmlFor={`${id}-file`} className="mb-1.5 block text-sm font-medium text-ink">
            {copy.fileLabel}
          </label>
          <select id={`${id}-file`} value={file} onChange={(event) => setFile(event.target.value)} className={selectClasses}>
            <option value="">{copy.fileNone}</option>
            {files.map((item) => (
              <option key={item.file} value={item.file}>
                {item.label} ({item.file.endsWith(".pdf") ? "PDF" : "MuseScore"})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {kinds.includes("page") ? (
        <TextField id={`${id}-page`} label={copy.pageLabel} placeholder={copy.pagePlaceholder} value={page} maxLength={300} onChange={setPage} />
      ) : null}

      {error ? <p className="text-sm text-gold-dark">{error}</p> : null}
    </div>
  );
}

function SongSearch({ song, setSong }: { song: SongPick | null; setSong: (song: SongPick | null) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ for: string; songs: Array<{ songId: string; title: string; number: string | null }> } | null>(null);
  const text = query.trim();
  const searchable = text.length >= 2 || /^\d+$/.test(text);
  const results = searchable && found?.for === text ? found.songs : null;

  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const timer = setTimeout(() => {
      void supportSongSearchAction(text).then((outcome) => {
        if (live) setFound({ for: text, songs: outcome.ok ? outcome.value : [] });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, searchable]);

  if (song && song.label) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">
          <span className="text-muted">{copy.songLabel} </span>
          {song.label}
        </p>
        <Button type="button" variant="quiet" onClick={() => setSong(null)}>
          {copy.songClear}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={`${id}-search`} className="mb-1.5 block text-sm font-medium text-ink">
        {copy.songSearchLabel}
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        placeholder={copy.songSearchPlaceholder}
        onChange={(event) => setQuery(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-line bg-surface px-4 text-base text-ink placeholder:text-muted"
        autoComplete="off"
      />
      {results ? (
        results.length > 0 ? (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface" aria-label={copy.songSearchLabel}>
            {results.map((item) => (
              <li key={item.songId}>
                <button
                  type="button"
                  className={cn("block min-h-11 w-full px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-paper focus-visible:bg-paper")}
                  onClick={() => setSong({ songId: item.songId, label: item.number ? `${item.number} · ${item.title}` : item.title })}
                >
                  {item.number ? <span className="tabular-nums text-muted">{item.number} · </span> : null}
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{copy.songSearchEmpty}</p>
        )
      ) : null}
    </div>
  );
}
