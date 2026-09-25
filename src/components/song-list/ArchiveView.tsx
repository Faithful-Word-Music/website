"use client";

import { useId, useMemo, useState } from "react";

import { KeySearch } from "@/components/song-list/KeySearch";
import { PillSelect } from "@/components/song-list/PillSelect";
import { SongSearch } from "@/components/song-list/SongSearch";
import { useNow } from "@/components/song-list/use-now";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";
import { SongLink } from "@/components/song-list/SongLink";
import { songListContent } from "@/content/song-list";
import {
  DEFAULT_SORT,
  filterSummaries,
  FIRST_DIRECTION,
  SORT_PRESETS,
  sortSummaries,
  summarize,
  type ArchiveRange,
  type ArchiveSortState,
  type SongSummary,
  type SortColumn,
} from "@/lib/archive-view";
import { formatAgo, formatLongDate } from "@/lib/service-time";
import { listKeys } from "@/lib/song-list";
import type { SongRecord } from "@/types/song-list";

/**
 * The searchable song archive: every song sung, how often, and when last.
 *
 * All the records arrive with the page (a few hundred songs at most), so the
 * search, key filter, period and sort all run here and respond instantly.
 */
export function ArchiveView({
  records,
  serviceCount,
  since,
  serverNow,
}: {
  records: SongRecord[];
  serviceCount: number;
  since: string | null;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const idPrefix = useId();
  const { archive } = songListContent;

  const [query, setQuery] = useState("");
  const [key, setKey] = useState("");
  const [range, setRange] = useState<ArchiveRange>("all");
  const [sort, setSort] = useState<ArchiveSortState>(DEFAULT_SORT);
  // Rows fade in only once the visitor starts searching or filtering.
  const [interacted, setInteracted] = useState(false);
  // How many rows are on screen; "Show more" adds another page.
  const [limit, setLimit] = useState(PAGE_SIZE);

  /** Any change to what is listed starts again from the top page. */
  function changed() {
    setInteracted(true);
    setLimit(PAGE_SIZE);
  }

  function interact<T>(set: (value: T) => void) {
    return (value: T) => {
      changed();
      set(value);
    };
  }

  const inRange = useMemo(() => summarize(records, range, now), [records, range, now]);
  const keys = useMemo(
    () => listKeys(inRange.flatMap((summary) => summary.keys.map((entry) => entry.key))),
    [inRange],
  );
  const rows = useMemo(
    () => sortSummaries(filterSummaries(inRange, { query, key }), sort),
    [inRange, query, key, sort],
  );
  // Suggestions offer the most-sung songs first.
  const popular = useMemo(() => sortSummaries(inRange, SORT_PRESETS.mostSung), [inRange]);

  // Clicking a column header sorts by it; clicking the same one again reverses.
  function sortBy(column: SortColumn) {
    changed();
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: FIRST_DIRECTION[column] },
    );
  }

  const shown = rows.slice(0, limit);
  const remaining = rows.length - shown.length;
  const nextPage = Math.min(PAGE_SIZE, remaining);

  const statusId = `${idPrefix}-status`;
  const resultsMessage = archive.results
    .replace("{count}", String(rows.length))
    .replace("{noun}", rows.length === 1 ? "song" : "songs");

  return (
    <div>
      <dl className="grid grid-cols-3 gap-3 sm:gap-5">
        <StatTile label={archive.stats.services} value={serviceCount.toLocaleString("en-US")} />
        <StatTile label={archive.stats.songs} value={records.length.toLocaleString("en-US")} />
        <StatTile
          label={archive.stats.since}
          value={since ? formatMonthYear(since) : "-"}
        />
      </dl>

      <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex w-full gap-3 lg:w-auto lg:flex-1">
          <SongSearch
            value={query}
            onChange={interact(setQuery)}
            inputId={`${idPrefix}-search`}
            songs={popular}
            describedBy={statusId}
            label={archive.search.label}
            placeholder={archive.search.placeholder}
          />
          <KeySearch
            value={key}
            onChange={interact(setKey)}
            inputId={`${idPrefix}-key`}
            keys={keys}
            describedBy={statusId}
          />
        </div>
        {/* Sorting is done by tapping the column headers, on every screen size. */}
        <PillSelect
          id={`${idPrefix}-range`}
          label={archive.range.label}
          value={range}
          onChange={interact(setRange)}
          options={[
            { value: "all", label: archive.range.all },
            { value: "year", label: archive.range.year },
            { value: "twelveMonths", label: archive.range.twelveMonths },
          ]}
          className="lg:w-40"
        />
      </div>

      <p id={statusId} role="status" aria-live="polite" className="mt-4 text-sm text-muted">
        {resultsMessage}
      </p>

      {rows.length === 0 ? (
        <p className="animate-enter mt-4 rounded-card border border-line bg-surface px-5 py-10 text-center text-muted">
          {archive.noResults}
        </p>
      ) : (
        // No overflow-hidden here: it would stop the header row from sticking.
        <Card className="mt-4">
          <table className="w-full border-collapse text-left">
            <thead className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
              <tr>
                <SortHeader
                  column="number"
                  label={archive.columns.number}
                  sort={sort}
                  onSort={sortBy}
                  className="w-12 rounded-tl-card pl-2.5 pr-1 sm:w-16 sm:pl-6 sm:pr-2"
                />
                <SortHeader
                  column="title"
                  label={archive.columns.title}
                  sort={sort}
                  onSort={sortBy}
                  className="pr-2 sm:pr-3"
                />
                <SortHeader
                  column="count"
                  label={archive.columns.count}
                  sort={sort}
                  onSort={sortBy}
                  align="right"
                  className="w-16 pr-2 sm:w-36 sm:pr-8"
                />
                <SortHeader
                  column="last"
                  label={archive.columns.last}
                  sort={sort}
                  onSort={sortBy}
                  className="w-24 rounded-tr-card pr-2.5 sm:pr-3 md:w-44 min-[860px]:rounded-tr-none"
                />
                <th
                  scope="col"
                  className={cn(
                    stickyHeaderCell,
                    "hidden w-40 py-3 pr-6 font-semibold min-[860px]:table-cell min-[860px]:rounded-tr-card",
                  )}
                >
                  {archive.columns.keys}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <ArchiveRow
                  key={row.id}
                  row={row}
                  now={now}
                  animateIn={interacted}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {remaining > 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setInteracted(true);
              setLimit((current) => current + PAGE_SIZE);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-6 text-sm font-medium text-ink shadow-card transition-colors duration-200 hover:border-gold"
          >
            {archive.showMore.replace("{count}", String(nextPage))}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          <p className="text-xs text-muted">
            {archive.showing
              .replace("{shown}", String(shown.length))
              .replace("{total}", String(rows.length))}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ArchiveRow({
  row,
  now,
  animateIn,
}: {
  row: SongSummary;
  now: number;
  animateIn: boolean;
}) {
  const lastAgo = formatAgo(Date.parse(row.last), now);
  const keyText = row.keys.map((entry) => entry.key).join(", ");

  return (
    <tr
      className={cn(
        "border-b border-line align-top transition-colors duration-150 last:border-0 hover:bg-paper/60",
        animateIn && "animate-enter",
      )}
    >
      <td className="tnum py-3 pl-2.5 pr-1 text-sm font-medium text-muted sm:pl-6 sm:pr-2">
        {row.number ?? <span aria-hidden="true">·</span>}
      </td>
      <td className="py-3 pr-2 sm:pr-3">
        <span className="block text-[0.95rem] leading-snug text-ink sm:text-base"><SongLink title={row.title} /></span>
        {/* Below 860px the keys column folds under the title: the least
            important detail, so the one that gives up its column. */}
        {keyText ? (
          <span className="mt-0.5 block text-xs text-muted min-[860px]:hidden">{keyText}</span>
        ) : null}
      </td>
      <td className="tnum py-3 pr-2 text-right text-sm font-semibold text-ink sm:pr-8">
        {row.count}
      </td>
      <td className="py-3 pr-2.5 text-sm sm:pr-3">
        {/* Phones get the relative time only; wider screens add the date. */}
        <time dateTime={row.last} className="hidden text-ink md:block">
          {formatLongDate(row.last)}
        </time>
        <span className="block text-xs text-ink-soft md:text-muted">{capitalize(lastAgo)}</span>
      </td>
      <td className="hidden py-3 pr-6 min-[860px]:table-cell">
        <span className="flex flex-wrap gap-1.5">
          {row.keys.map((entry) => (
            <span
              key={entry.key}
              className="tnum rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-soft"
            >
              {entry.key}
            </span>
          ))}
        </span>
      </td>
    </tr>
  );
}

/** How many archive rows show at first, and how many more each "Show more" adds. */
const PAGE_SIZE = 50;

/**
 * Header cells stay in view under the site header (h-16) while scrolling a
 * long list. Opaque, so rows pass cleanly underneath; the bottom rule is a
 * shadow because a sticky cell leaves its table border behind.
 */
const stickyHeaderCell =
  "sticky top-16 z-10 bg-paper shadow-[inset_0_-1px_0_var(--color-line)]";

/**
 * A column header that sorts the table. The standard sortable-table pattern:
 * the header is a button, `aria-sort` tells screen readers the current order,
 * and an arrow shows it - faintly on hover for the columns not in use.
 */
function SortHeader({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: {
  column: SortColumn;
  label: string;
  sort: ArchiveSortState;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.column === column;
  const direction = active ? sort.direction : FIRST_DIRECTION[column];

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        stickyHeaderCell,
        "py-1.5 font-semibold",
        align === "right" && "text-right",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group -mx-1.5 inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 uppercase tracking-[0.14em] transition-colors duration-150 hover:text-ink sm:whitespace-nowrap",
          active ? "text-ink" : "text-muted",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={cn(
            "shrink-0 transition-[opacity,transform] duration-200",
            direction === "asc" && "rotate-180",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
          )}
        >
          <path d="M5 1.5v7M2 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );
}

const monthYear = new Intl.DateTimeFormat("en-US", {
  timeZone: siteConfig.songList.timeZone,
  month: "short",
  year: "numeric",
});

function formatMonthYear(startsAt: string): string {
  return monthYear.format(new Date(startsAt));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
