"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Pill } from "@/components/admin/StatusPill";
import { SongLink } from "@/components/song-list/SongLink";
import { buttonClasses } from "@/components/ui/Button";
import { songListContent } from "@/content/song-list";
import {
  archiveKeys,
  filterArchive,
  NO_FILTER,
  SERVICE_TYPES,
  type ArchiveFilter,
  type ArchivedService,
  type ServiceTypeFilter,
} from "@/lib/service-archive";
import { serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import { isInsert } from "@/lib/service-planner/model";
import { formatChurchTime } from "@/lib/service-time";
import { listKeys } from "@/lib/song-list";

const copy = songListContent.serviceArchive;
const PAGE_SIZE = 30;

const field =
  "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-muted/50";

/**
 * Every past service as a complete song list, newest first, with filters for
 * the questions a planner asks of the past: a date, a song, a service, a key,
 * an insert. Everything arrives with the page, so filtering is instant.
 */
export function ServiceArchiveView({ services }: { services: ArchivedService[] }) {
  const [filter, setFilter] = useState<ArchiveFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const keys = useMemo(() => listKeys(archiveKeys(services)), [services]);
  const matches = useMemo(() => filterArchive(services, filter), [services, filter]);
  const set = <K extends keyof ArchiveFilter>(name: K, value: ArchiveFilter[K]) => {
    setFilter((current) => ({ ...current, [name]: value }));
    setLimit(PAGE_SIZE);
  };
  const filtering = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);

  return (
    <div>
      <form className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">{copy.filters.song}</span>
          <input
            type="search"
            value={filter.song}
            placeholder={copy.filters.songPlaceholder}
            onChange={(event) => set("song", event.target.value)}
            className={field}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">{copy.filters.type}</span>
          <select value={filter.type} onChange={(event) => set("type", event.target.value as ServiceTypeFilter)} className={field}>
            {SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {copy.types[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">{copy.filters.key}</span>
          <select value={filter.key} onChange={(event) => set("key", event.target.value)} className={field}>
            <option value="">{copy.filters.anyKey}</option>
            {keys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">{copy.filters.from}</span>
          <input type="date" value={filter.from} onChange={(event) => set("from", event.target.value)} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">{copy.filters.to}</span>
          <input type="date" value={filter.to} onChange={(event) => set("to", event.target.value)} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={filter.insertOnly} onChange={() => set("insertOnly", !filter.insertOnly)} className="h-4 w-4" />
            {copy.filters.insertOnly}
          </label>
          {filtering ? (
            <button type="button" onClick={() => setFilter(NO_FILTER)} className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold">
              {copy.filters.clear}
            </button>
          ) : null}
          <p className="ml-auto text-sm text-muted" aria-live="polite">
            {matches.length === 1 ? copy.resultsOne : copy.results.replace("{count}", String(matches.length))}
          </p>
        </div>
      </form>

      {matches.length === 0 ? (
        <p className="mt-8 text-center text-muted">{copy.noResults}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {matches.slice(0, limit).map((service) => (
            <li key={service.anchor}>
              <ServiceSummary service={service} highlight={filter} />
            </li>
          ))}
        </ul>
      )}

      {matches.length > limit ? (
        <div className="mt-8 text-center">
          <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)} className={buttonClasses("secondary")}>
            {copy.showMore.replace("{count}", String(Math.min(PAGE_SIZE, matches.length - limit)))}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ServiceSummary({ service, highlight }: { service: ArchivedService; highlight: ArchiveFilter }) {
  const wanted = highlight.song.trim().toLowerCase();
  return (
    <article className="h-full rounded-card border border-line bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/song-list/archive/services/${service.anchor}`}
          className="font-display text-lg text-ink underline decoration-transparent underline-offset-4 transition-[color,text-decoration-color] hover:decoration-gold"
        >
          {serviceTitle(service)}
        </Link>
        {service.special ? <Pill tone="muted">{copy.special}</Pill> : null}
      </header>
      <p className="text-sm text-muted">
        {serviceFullDate(service.startsAt)} · {formatChurchTime(service.startsAt)}
      </p>
      <ol className="mt-3 space-y-1 text-sm">
        {service.songs.map((song, index) => {
          const hit = wanted !== "" && (song.title.toLowerCase().includes(wanted) || song.number?.toLowerCase().startsWith(wanted.replace(/^#/, "")));
          return (
            <li key={index} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">{song.number ?? ""}</span>
              <span className={hit ? "font-medium text-ink" : "text-ink"}>
                <SongLink title={song.title} />
              </span>
              {isInsert(song) ? <span className="text-[0.65rem] uppercase tracking-wider text-gold-dark">{copy.insert}</span> : null}
              <span className="ml-auto shrink-0 text-muted">{song.key ?? ""}</span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
