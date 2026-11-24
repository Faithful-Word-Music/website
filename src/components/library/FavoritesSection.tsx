"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { NewTabNote, songLinkProps } from "@/components/song-list/SongLink";
import { SongSearch } from "@/components/song-list/SongSearch";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { favoritesContent as copy } from "@/content/favorites";
import {
  FAVORITE_SORTS,
  FAVORITES_PAGE_SIZE,
  MAX_FAVORITES_PAGE_SIZE,
  MAX_FAVORITES_QUERY,
  type FavoriteEntry,
  type FavoriteErrorBody,
  type FavoriteErrorCode,
  type FavoriteSort,
  type FavoritesPage,
} from "@/lib/favorites-api";
import { plural } from "@/lib/plural";

import { FavoriteButton } from "./FavoriteButton";
import { useFavorites } from "./FavoritesProvider";

type ListState =
  | { phase: "loading" }
  | { phase: "error"; code: FavoriteErrorCode | null }
  | { phase: "ready"; page: FavoritesPage; items: FavoriteEntry[] };

const SEARCH_DELAY_MS = 250;
const noSubscribe = () => () => undefined;
const zero = () => 0;

async function readPage(params: URLSearchParams, signal: AbortSignal): Promise<{ page: FavoritesPage } | { code: FavoriteErrorCode | null }> {
  const response = await fetch(`/api/account/favorites?${params}`, { credentials: "same-origin", signal });
  const body = (await response.json().catch(() => null)) as FavoritesPage | FavoriteErrorBody | null;
  if (response.ok && body && "items" in body) return { page: body };
  return { code: body && "code" in body ? body.code : null };
}

/**
 * The member's saved songs. Keyed by account, so nothing shown for one person
 * survives into the next person's list.
 */
export function FavoritesSection() {
  const { controller, access } = useFavorites();
  const account = useAccount();
  if (access === "blocked") return <Message title={copy.blockedTitle} body={copy.errors["profile-blocked"]} />;
  if (controller) return <FavoritesList key={controller.accountId} />;
  if (account.isLoaded && !account.isSignedIn) return <Message title={copy.errorTitle} body={copy.errors.unauthorized} />;
  if (account.isLoaded && account.meSettled && !account.me) {
    return <Message title={copy.errorTitle} body={copy.errorBody} action={<RetryButton onClick={() => window.location.reload()} />} />;
  }
  return <ListSkeleton />;
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{copy.loading}</span>
      <div aria-hidden="true" className="space-y-3">
        {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-11 w-full" />)}
      </div>
    </div>
  );
}

/** Searched, sorted and paged by the server across the whole collection. */
function FavoritesList() {
  const { controller } = useFavorites();
  const inputId = useId();
  const statusId = useId();
  const sortId = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FavoriteSort>("recent");
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const shownCount = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);

  const version = useSyncExternalStore(
    controller?.subscribeCollection ?? noSubscribe,
    controller?.getCollectionVersion ?? zero,
    zero,
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // The first page, again whenever the search, sort or collection changes. A
  // refresh keeps what is on screen and reads as many rows as are showing.
  useEffect(() => {
    if (!controller) return;
    const abort = new AbortController();
    moreRequest.current?.abort();
    const startedAt = controller.beginRead();
    const limit = Math.min(MAX_FAVORITES_PAGE_SIZE, Math.max(FAVORITES_PAGE_SIZE, shownCount.current));
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (search) params.set("q", search);
    readPage(params, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if ("page" in result) {
          controller.seed(result.page.items.flatMap((item) => (item.kind === "song" ? [item.songId] : [])), startedAt);
          shownCount.current = result.page.items.length;
          setMoreFailed(false);
          setList({ phase: "ready", page: result.page, items: result.page.items });
        } else {
          setList({ phase: "error", code: result.code });
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setList({ phase: "error", code: null });
      });
    return () => abort.abort();
  }, [controller, search, sort, version, attempt]);

  const retry = useCallback(() => {
    setList({ phase: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const changeSort = (next: FavoriteSort) => {
    shownCount.current = 0;
    setList({ phase: "loading" });
    setSort(next);
  };

  const changeQuery = (next: string) => {
    shownCount.current = 0;
    setQuery(next.slice(0, MAX_FAVORITES_QUERY));
  };

  const clearSearch = () => {
    shownCount.current = 0;
    setQuery("");
    setSearch("");
  };

  const loadMore = async () => {
    if (list.phase !== "ready" || !list.page.nextCursor || !controller) return;
    const abort = new AbortController();
    moreRequest.current = abort;
    setLoadingMore(true);
    setMoreFailed(false);
    const startedAt = controller.beginRead();
    const params = new URLSearchParams({ sort, limit: String(FAVORITES_PAGE_SIZE), cursor: list.page.nextCursor });
    if (search) params.set("q", search);
    try {
      const result = await readPage(params, abort.signal);
      if (abort.signal.aborted) return;
      if ("page" in result) {
        const { page } = result;
        controller.seed(page.items.flatMap((item) => (item.kind === "song" ? [item.songId] : [])), startedAt);
        setList((current) => {
          if (current.phase !== "ready") return current;
          const known = new Set(current.items.map((item) => item.key));
          const items = [...current.items, ...page.items.filter((item) => !known.has(item.key))];
          shownCount.current = items.length;
          return { phase: "ready", page, items };
        });
      } else if (result.code === "invalid-cursor") {
        // The order changed under this cursor: start again from the top.
        shownCount.current = 0;
        retry();
      } else {
        setMoreFailed(true);
      }
    } catch {
      if (!abort.signal.aborted) setMoreFailed(true);
    } finally {
      if (!abort.signal.aborted) setLoadingMore(false);
    }
  };

  const dropEntry = useCallback((key: string) => {
    setList((current) => {
      if (current.phase !== "ready") return current;
      const items = current.items.filter((item) => item.key !== key);
      shownCount.current = items.length;
      return {
        ...current,
        items,
        page: { ...current.page, total: Math.max(0, current.page.total - 1), matched: Math.max(0, current.page.matched - 1) },
      };
    });
  }, []);

  const searching = query.trim() !== "";
  const ready = list.phase === "ready" ? list : null;
  const count = ready
    ? search
      ? plural(copy.matchCount, ready.page.matched).replace("{total}", ready.page.total.toLocaleString("en-US"))
      : plural(copy.count, ready.page.total)
    : "";
  const emptyCollection = ready !== null && ready.page.total === 0;

  return (
    <div>
      {emptyCollection ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SongSearch
            value={query}
            onChange={changeQuery}
            inputId={inputId}
            describedBy={statusId}
            label={copy.search.label}
            placeholder={copy.search.placeholder}
            className="sm:max-w-md"
          />
          <div className="flex shrink-0 items-center justify-between gap-4">
            <p id={statusId} role="status" className="tnum text-sm text-muted">{count}</p>
            <label htmlFor={sortId} className="flex items-center gap-2 text-sm text-muted">
              {copy.sortLabel}
              <select
                id={sortId}
                value={ready?.page.directory === "unavailable" ? "recent" : sort}
                disabled={ready?.page.directory === "unavailable"}
                onChange={(event) => changeSort(event.target.value as FavoriteSort)}
                className="min-h-11 rounded-full border border-line bg-surface pl-4 pr-8 text-sm text-ink"
              >
                {FAVORITE_SORTS.map((option) => <option key={option} value={option}>{copy.sorts[option]}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {ready?.page.directory === "unavailable" ? (
        <p role="status" className="mt-4 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
          {copy.directoryNotice} {sort !== "recent" ? copy.sortedByDate : null}{" "}
          <button type="button" onClick={retry} className="underline underline-offset-4 hover:text-ink">{copy.retry}</button>
        </p>
      ) : null}

      <div className="mt-6">
        {list.phase === "loading" ? (
          <ListSkeleton />
        ) : list.phase === "error" ? (
          list.code === "directory-unavailable" && searching ? (
            <Message title={copy.errorTitle} body={copy.directorySearch} action={<RetryButton onClick={retry} />} secondary={<ClearButton onClick={clearSearch} />} />
          ) : list.code === "account-erasing" || list.code === "profile-blocked" ? (
            <Message title={copy.blockedTitle} body={copy.errors[list.code]} />
          ) : list.code === "unauthorized" ? (
            <Message title={copy.errorTitle} body={copy.errors.unauthorized} />
          ) : (
            <Message title={copy.errorTitle} body={copy.errorBody} action={<RetryButton onClick={retry} />} />
          )
        ) : list.page.total === 0 ? (
          <Message
            title={copy.emptyTitle}
            body={copy.emptyBody}
            action={<Link href="/library" className={buttonClasses("primary", "md", "px-6")}>{copy.emptyAction}</Link>}
          />
        ) : list.items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-display text-2xl text-ink">{copy.noMatchTitle.replace("{query}", search)}</p>
            <p className="mt-2 text-muted">{copy.noMatchBody}</p>
            <ClearButton onClick={clearSearch} className="mt-6" />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line border-y border-line">
              {list.items.map((item) => (
                <li key={`${item.kind}:${item.key}`}>
                  {item.kind === "song" ? <SongRow song={item} /> : <UnavailableRow entry={item} onRemoved={dropEntry} onUncertain={retry} />}
                </li>
              ))}
            </ul>
            {moreFailed ? <p role="alert" className="mt-4 text-center text-sm text-ink-soft">{copy.errorBody}</p> : null}
            {list.page.nextCursor ? (
              <div className="mt-6 text-center">
                <button type="button" onClick={loadMore} disabled={loadingMore} className={buttonClasses("secondary", "md", "px-6")}>
                  {loadingMore ? copy.loadingMore : moreFailed ? copy.retry : copy.loadMore}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SongRow({ song }: { song: Extract<FavoriteEntry, { kind: "song" }> }) {
  const detail = [song.number ? `#${song.number}` : null, song.collection].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2">
      <Link href={song.href} {...songLinkProps} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-sm py-2 focus-visible:outline-offset-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="min-w-0 font-display text-[1.0625rem] leading-snug text-ink transition-colors group-hover:text-gold-dark motion-reduce:transition-none">
          {song.title}
          <NewTabNote />
        </span>
        {detail ? <span className="tnum shrink-0 text-xs text-muted sm:text-sm">{detail}</span> : null}
      </Link>
      <FavoriteButton songId={song.songId} title={song.title} />
    </div>
  );
}

/** A saved record with no safe details: no guessed title and no link, only a way to remove it. */
function UnavailableRow({
  entry,
  onRemoved,
  onUncertain,
}: {
  entry: Exclude<FavoriteEntry, { kind: "song" }>;
  onRemoved: (key: string) => void;
  onUncertain: () => void;
}) {
  const { controller } = useFavorites();
  const [state, setState] = useState<"idle" | "removing" | "failed">("idle");
  const text = copy.unavailable[entry.kind];

  const remove = async () => {
    if (!controller) return;
    setState("removing");
    const result = await controller.removeEntry(entry.key);
    if (result === "removed") onRemoved(entry.key);
    else if (result === "uncertain") onUncertain();
    else setState("failed");
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] text-ink-soft">{text.title}</span>
        <span className="block text-xs text-muted">{state === "failed" ? copy.failed : text.detail}</span>
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={state === "removing"}
        aria-label={copy.button.removeEntry}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold disabled:opacity-60 motion-reduce:transition-none"
      >
        {copy.button.removeShort}
      </button>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={buttonClasses("secondary", "md", "px-6")}>{copy.retry}</button>;
}

function ClearButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} className={buttonClasses("secondary", "md", `px-6 ${className ?? ""}`)}>{copy.clearSearch}</button>;
}

function Message({ title, body, action, secondary }: { title: string; body: string; action?: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <Card className="p-6 text-center sm:p-8">
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">{body}</p>
      {action || secondary ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}{secondary}</div> : null}
    </Card>
  );
}
