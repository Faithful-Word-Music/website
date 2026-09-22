"use client";

import { useId, useMemo, useState } from "react";

import { FallbackTable } from "@/components/song-list/FallbackTable";
import { MonthTabs } from "@/components/song-list/MonthTabs";
import { ServiceCard } from "@/components/song-list/ServiceCard";
import { SongListEmpty } from "@/components/song-list/SongListStates";
import { SongSearch } from "@/components/song-list/SongSearch";
import { Reveal } from "@/components/ui/Reveal";
import { countSongs, filterServices } from "@/lib/song-list";
import { songListContent } from "@/content/song-list";
import type { SongListMonth } from "@/types/song-list";

/**
 * The interactive part of the song list: month switching and search.
 *
 * The data arrives already fetched and parsed from the server component, so no
 * Google request ever happens in the browser and no API key is involved here.
 */
export function SongListView({ months }: { months: SongListMonth[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const idPrefix = useId();
  const searchId = `${idPrefix}-search`;
  const statusId = `${idPrefix}-status`;

  const month = months[activeIndex] ?? months[0];
  const visibleServices = useMemo(
    () => filterServices(month.services, query),
    [month, query],
  );

  const searching = query.trim() !== "";
  const matchCount = countSongs(visibleServices);
  const { search } = songListContent;

  const resultsMessage = search.results
    .replace("{count}", String(matchCount))
    .replace("{noun}", matchCount === 1 ? "song" : "songs")
    .replace("{month}", month.title);

  function changeMonth(index: number) {
    setActiveIndex(index);
    setQuery("");
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs appear only when the spreadsheet actually has a second visible
            month. With one month there is no tab bar and no placeholder. */}
        {months.length > 1 ? (
          <MonthTabs
            titles={months.map((item) => item.title)}
            activeIndex={activeIndex}
            onChange={changeMonth}
            idPrefix={idPrefix}
          />
        ) : (
          <h2 className="font-display text-2xl text-ink">{month.title}</h2>
        )}

        {month.services.length > 0 ? (
          <SongSearch
            value={query}
            onChange={setQuery}
            inputId={searchId}
            describedBy={statusId}
          />
        ) : null}
      </div>

      {/* Announced to screen readers as the result count changes. */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={searching ? "mt-4 text-sm text-muted" : "sr-only"}
      >
        {searching ? resultsMessage : ""}
      </p>

      <div
        id={months.length > 1 ? `${idPrefix}-panel-${activeIndex}` : undefined}
        role={months.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={
          months.length > 1 ? `${idPrefix}-tab-${activeIndex}` : undefined
        }
        tabIndex={months.length > 1 ? 0 : undefined}
        className="mt-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-dark"
      >
        <MonthBody
          month={month}
          services={visibleServices}
          searching={searching}
        />
      </div>
    </div>
  );
}

function MonthBody({
  month,
  services,
  searching,
}: {
  month: SongListMonth;
  services: ReturnType<typeof filterServices>;
  searching: boolean;
}) {
  if (month.fallbackRows) {
    return <FallbackTable rows={month.fallbackRows} />;
  }

  if (month.services.length === 0) {
    return <SongListEmpty />;
  }

  if (services.length === 0 && searching) {
    return (
      <p className="rounded-card border border-line bg-surface px-5 py-10 text-center text-muted">
        {songListContent.search.noResults}
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      {services.map((service, index) => (
        // The offset is by column, not by position in the list: cards reveal as
        // you scroll past them, so a running index-based delay would leave the
        // last ones waiting.
        <Reveal key={service.id} delay={(index % 2) * 70}>
          <ServiceCard service={service} />
        </Reveal>
      ))}
    </div>
  );
}
