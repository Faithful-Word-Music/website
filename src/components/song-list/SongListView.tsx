"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { useActiveMonth } from "@/components/song-list/active-month";
import { FallbackTable } from "@/components/song-list/FallbackTable";
import { KeySearch } from "@/components/song-list/KeySearch";
import { MonthTabs } from "@/components/song-list/MonthTabs";
import { NextServiceSpotlight } from "@/components/song-list/NextServiceSpotlight";
import { ServiceCard } from "@/components/song-list/ServiceCard";
import { ShareBar } from "@/components/song-list/ShareBar";
import { ShareButton } from "@/components/song-list/ShareButton";
import { SongListEmpty } from "@/components/song-list/SongListStates";
import { SongSearch } from "@/components/song-list/SongSearch";
import { useNow } from "@/components/song-list/use-now";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Reveal } from "@/components/ui/Reveal";
import { songListContent } from "@/content/song-list";
import { getTimeline, type Timeline } from "@/lib/service-time";
import { MAX_SHARED_SERVICES, serviceName } from "@/lib/share-services";
import type { PlayIndex } from "@/lib/song-history";
import { countSongs, filterServices, listKeys } from "@/lib/song-list";
import type { Service, SongListMonth } from "@/types/song-list";

/**
 * The interactive song list: the next-service spotlight, month switching,
 * search and key filter, and sharing services as text - one card at a time,
 * or several at once in select mode.
 *
 * The data arrives already fetched and parsed from the server component, so no
 * Google request ever happens in the browser and no API key is involved here.
 * Only the clock runs here: which service is "Next" or "Now" is worked out
 * against the visitor's live time, so it changes the moment a service starts.
 */
export function SongListView({
  months,
  plays,
  serverNow,
}: {
  months: SongListMonth[];
  /** When each song on these months was sung, for the hints. null if history is unavailable. */
  plays: PlayIndex | null;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const idPrefix = useId();
  const searchId = `${idPrefix}-search`;
  const keyId = `${idPrefix}-key`;
  const statusId = `${idPrefix}-status`;

  const allServices = useMemo(() => months.flatMap((month) => month.services), [months]);
  const timeline = useMemo(() => getTimeline(allServices, now), [allServices, now]);

  // Shared with the page header's PDF link. It opens on the month holding the
  // next service (openingMonthIndex, chosen on the server).
  const { activeIndex, setActiveIndex } = useActiveMonth();
  const [query, setQuery] = useState("");
  const [key, setKey] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);
  // Cards animate in only once the visitor starts searching or switching:
  // on first load they arrive with the page, as everywhere else on the site.
  const [interacted, setInteracted] = useState(false);
  // Select mode: tick services, then share them together from the bar.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Counts taps on a fourth service; each one shows (and shakes) the limit
  // message in the share bar.
  const [limitHits, setLimitHits] = useState(0);

  function updateQuery(value: string) {
    setInteracted(true);
    setQuery(value);
  }

  function updateKey(value: string) {
    setInteracted(true);
    setKey(value);
  }

  const month = months[activeIndex] ?? months[0];
  const filter = useMemo(() => ({ query, key }), [query, key]);
  const visibleServices = useMemo(
    () => filterServices(month.services, filter),
    [month, filter],
  );
  const keys = useMemo(
    () => listKeys(month.services.flatMap((service) => service.songs.map((song) => song.key))),
    [month],
  );
  // Suggestions offer the coming services' songs first, then the rest of the month.
  const songs = useMemo(() => {
    const upcoming = month.services.filter((s) => timeline.statusOf(s.id) !== "past");
    const past = month.services.filter((s) => timeline.statusOf(s.id) === "past");
    return [...upcoming, ...past].flatMap((service) => service.songs);
  }, [month, timeline]);

  const filtering = query.trim() !== "" || key.trim() !== "";
  const matchCount = countSongs(visibleServices);
  const { search } = songListContent;

  const resultsMessage = search.results
    .replace("{count}", String(matchCount))
    .replace("{noun}", matchCount === 1 ? "song" : "songs")
    .replace("{month}", month.title);

  const byId = new Map(allServices.map((service) => [service.id, service]));
  const current = timeline.nowId ? (byId.get(timeline.nowId) ?? null) : null;
  const next = timeline.nextId ? (byId.get(timeline.nextId) ?? null) : null;

  function changeMonth(index: number) {
    setInteracted(true);
    setActiveIndex(index);
    setQuery("");
    setKey("");
    setShowEarlier(false);
    stopSelecting();
  }

  function stopSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  const atLimit = selectedIds.size >= MAX_SHARED_SERVICES;

  function toggleSelected(id: string) {
    // A fourth service is not ticked: the bar says why instead.
    if (!selectedIds.has(id) && atLimit) {
      setLimitHits((hits) => hits + 1);
      return;
    }
    setSelectedIds((ids) => {
      const nextIds = new Set(ids);
      if (!nextIds.delete(id)) nextIds.add(id);
      return nextIds;
    });
  }

  // Escape leaves select mode (an open share menu handles its own Escape first).
  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelecting(false);
        setSelectedIds(new Set());
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting]);

  // Always share a service whole, even while a search shows only some of its songs.
  const wholeById = new Map(month.services.map((service) => [service.id, service]));
  const selectedServices = month.services.filter((service) => selectedIds.has(service.id));
  const { share } = songListContent;
  const canShare = month.services.length > 0 && !month.fallbackRows;

  // While searching, every match shows in date order, so nothing is tucked away.
  const earlierCount =
    filtering || month.fallbackRows
      ? 0
      : visibleServices.filter((s) => timeline.statusOf(s.id) === "past").length;
  const earlierId = `${idPrefix}-earlier`;
  const { earlier: earlierCopy } = songListContent;

  function cardExtras(service: Service): CardExtras {
    if (selecting) {
      return {
        selection: {
          selected: selectedIds.has(service.id),
          // Unticked cards rest while the limit is reached.
          blocked: atLimit && !selectedIds.has(service.id),
          onToggle: () => toggleSelected(service.id),
        },
      };
    }
    const whole = wholeById.get(service.id) ?? service;
    return {
      share: (
        <ShareButton
          variant="icon"
          services={[whole]}
          monthTitle={month.title}
          label={share.buttonLabel.replace("{date}", serviceName(whole))}
        />
      ),
    };
  }

  function clearFilters() {
    setQuery("");
    setKey("");
  }

  return (
    // Room at the bottom in select mode, so the bar never covers the last card.
    <div className={cn(selecting && "pb-24")}>
      <NextServiceSpotlight current={current} next={next} plays={plays} now={now} />

      <div className="mt-12 flex flex-col gap-4 sm:mt-14 lg:flex-row lg:items-center lg:justify-between">
        {/* Tabs appear only when the spreadsheet actually has a second visible
            month. With one month there is no tab bar and no placeholder. */}
        <div>
          {months.length > 1 ? (
            <MonthTabs
              titles={months.map((item) => item.title)}
              activeIndex={activeIndex}
              onChange={changeMonth}
              idPrefix={idPrefix}
            />
          ) : (
            <h2 className="font-display text-2xl text-ink sm:text-3xl">{month.title}</h2>
          )}
        </div>
        {month.services.length > 0 ? (
          <div className="flex w-full gap-3 lg:w-auto">
            <SongSearch
              value={query}
              onChange={updateQuery}
              className="lg:w-72"
              inputId={searchId}
              songs={songs}
              describedBy={statusId}
            />
            <KeySearch
              value={key}
              onChange={updateKey}
              inputId={keyId}
              keys={keys}
              describedBy={statusId}
            />
          </div>
        ) : null}
      </div>

      {/* One line straight above the cards, for what acts on them: earlier
          services (or, while searching, the result count) on the left,
          Select on the right. */}
      <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">
          {/* Announced to screen readers as the result count changes. */}
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="flex items-center text-sm text-muted"
          >
            {filtering ? (
              <span className="animate-enter flex items-center gap-3">
                <span>{resultsMessage}</span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark"
                >
                  {search.clearFilters}
                </button>
              </span>
            ) : null}
          </p>
          {earlierCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowEarlier((value) => !value)}
              aria-expanded={showEarlier}
              aria-controls={earlierId}
              className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className={cn("transition-transform duration-200", showEarlier && "rotate-90")}
              >
                <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
              {showEarlier
                ? earlierCopy.hide
                : earlierCopy.show.replace("{count}", String(earlierCount))}
            </button>
          ) : null}
        </div>
        {canShare ? (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            // The same pill as the page's other buttons; it fills in while
            // select mode is on, so it is plain the page is in it.
            className={buttonClasses(selecting ? "primary" : "secondary", "md", "shrink-0 px-4")}
          >
            {/* Keyed, so the icon pops in afresh as it swaps. */}
            <svg key={selecting ? "x" : "tick"} aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" className="animate-pop">
              {selecting ? (
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              ) : (
                <>
                  <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5.3 8.2l1.8 1.8 3.6-3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
            {selecting ? share.cancel : share.select}
          </button>
        ) : null}
      </div>

      <div
        id={months.length > 1 ? `${idPrefix}-panel-${activeIndex}` : undefined}
        role={months.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={months.length > 1 ? `${idPrefix}-tab-${activeIndex}` : undefined}
        tabIndex={months.length > 1 ? 0 : undefined}
        className="mt-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-dark"
      >
        <MonthBody
          month={month}
          services={visibleServices}
          filtering={filtering}
          timeline={timeline}
          plays={plays}
          now={now}
          showEarlier={showEarlier}
          earlierId={earlierId}
          animateIn={interacted}
          cardExtras={cardExtras}
        />
      </div>

      {month.note ? (
        <p className="mt-8 text-center text-sm italic text-muted">{month.note}</p>
      ) : null}

      <div className="mt-12 flex justify-center">
        <Link
          href="/song-list/archive"
          className={buttonClasses("secondary", "md", "group px-6")}
        >
          {songListContent.archiveLinkLabel}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>

      {selecting ? (
        <ShareBar
          services={selectedServices}
          monthTitle={month.title}
          limitHits={limitHits}
          onDone={stopSelecting}
        />
      ) : null}
    </div>
  );
}

/** What a card gets beyond its service: a share button, or its select-mode tick. */
type CardExtras = {
  share?: ReactNode;
  selection?: { selected: boolean; blocked: boolean; onToggle: () => void };
};

function MonthBody({
  month,
  services,
  filtering,
  timeline,
  plays,
  now,
  showEarlier,
  earlierId,
  animateIn,
  cardExtras,
}: {
  month: SongListMonth;
  services: Service[];
  filtering: boolean;
  timeline: Timeline;
  plays: PlayIndex | null;
  now: number;
  /** Whether the earlier services are open - toggled from the line above the cards. */
  showEarlier: boolean;
  earlierId: string;
  /** Fade cards in as they appear (once the visitor has searched or switched). */
  animateIn: boolean;
  cardExtras: (service: Service) => CardExtras;
}) {
  if (month.fallbackRows) {
    return <FallbackTable rows={month.fallbackRows} />;
  }

  if (month.services.length === 0) {
    return <SongListEmpty />;
  }

  if (services.length === 0 && filtering) {
    return (
      <p className="animate-enter rounded-card border border-line bg-surface px-5 py-10 text-center text-muted">
        {songListContent.search.noResults}
      </p>
    );
  }

  // While searching, show every match in date order - the question is "when
  // do we sing this?", and a past date answers it as well as a future one.
  const earlier = filtering ? [] : services.filter((s) => timeline.statusOf(s.id) === "past");
  const later = filtering ? services : services.filter((s) => timeline.statusOf(s.id) !== "past");

  return (
    <div>
      {earlier.length > 0 ? (
        <div
          className={cn(
            "transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            showEarlier && "mb-4 sm:mb-5",
          )}
        >
          {/* Opens and closes smoothly by animating the grid row between 0 and
              its natural height; `inert` keeps collapsed cards out of the tab order. */}
          <div
            id={earlierId}
            inert={!showEarlier}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              showEarlier ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            {/* `relative` matters: overflow only clips absolutely positioned
                descendants (the cards' screen-reader table headers) when the
                clipping box is itself positioned. Without it they escape the
                collapsed section and stretch the page below the footer. */}
            <div className="relative min-h-0 overflow-hidden">
              <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
                {earlier.map((service) => (
                  <ServiceCard
                    key={`${month.title}:${service.id}`}
                    service={service}
                    status="past"
                    plays={plays}
                    now={now}
                    {...cardExtras(service)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {later.map((service, index) => (
          // The offset is by column, not by position in the list: cards reveal as
          // you scroll past them, so a running index-based delay would leave the
          // last ones waiting.
          // Keyed by month too, so switching months brings in fresh cards.
          <Reveal key={`${month.title}:${service.id}`} delay={(index % 2) * 70}>
            <ServiceCard
              animateIn={animateIn}
              service={service}
              status={timeline.statusOf(service.id)}
              plays={plays}
              now={now}
              {...cardExtras(service)}
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
