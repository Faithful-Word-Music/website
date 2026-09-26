"use client";

import { useEffect, useState } from "react";

import { ShareButton } from "@/components/song-list/ShareButton";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { MAX_SHARED_SERVICES } from "@/lib/share-services";
import type { Service } from "@/types/song-list";

/**
 * The bar pinned to the bottom of the screen in select mode: how many
 * services are ticked ("2 of 3 selected"), Share, and Done.
 *
 * Tapping a fourth service shakes the count and floats a short note above the
 * bar - "You can share up to 3 services at a time" - for a couple of seconds.
 * The note sits above rather than in place of the count: a phone's bar has no
 * room for the sentence beside its buttons.
 *
 * While it is up, the page's "Back to top" button steps aside (it would sit
 * on top of the bar) - via a data attribute on <html>, see BackToTop.
 */
export function ShareBar({
  services,
  monthTitle,
  limitHits,
  onDone,
}: {
  /** The ticked services, whole. */
  services: Service[];
  /** The month tab the services are on. */
  monthTitle: string;
  /** Goes up each time a fourth service is tapped. */
  limitHits: number;
  onDone: () => void;
}) {
  const { share } = songListContent;
  const count = services.length;
  const max = String(MAX_SHARED_SERVICES);

  // The note shows while the latest tap is newer than the one last cleared.
  const [clearedHits, setClearedHits] = useState(limitHits);
  const showLimit = limitHits !== clearedHits;
  useEffect(() => {
    if (limitHits === clearedHits) return;
    const timer = window.setTimeout(() => setClearedHits(limitHits), 2500);
    return () => window.clearTimeout(timer);
  }, [limitHits, clearedHits]);

  useEffect(() => {
    document.documentElement.dataset.shareBar = "";
    return () => {
      delete document.documentElement.dataset.shareBar;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Announced as it appears; keyed so each new tap replays its entrance. */}
      <p aria-live="assertive" className="min-h-8">
        {showLimit ? (
          <span
            key={limitHits}
            className="animate-enter inline-flex min-h-8 items-center rounded-full bg-ink px-4 text-center text-sm font-medium text-paper shadow-lift"
          >
            {share.limitReached.replace("{max}", max)}
          </span>
        ) : null}
      </p>
      <div
        role="region"
        aria-label={share.share}
        className="glass animate-enter pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5"
      >
        <p
          key={limitHits}
          aria-live="polite"
          className={cn(
            "tnum min-w-0 flex-1 truncate text-sm text-ink-soft",
            limitHits > 0 && "animate-shake",
          )}
        >
          {count > 0
            ? share.selectedCount.replace("{count}", String(count)).replace("{max}", max)
            : share.selectPrompt}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {share.done}
        </button>
        <ShareButton
          variant="primary"
          label={share.share}
          services={services}
          monthTitle={monthTitle}
          placement="above"
          disabled={count === 0}
        />
      </div>
    </div>
  );
}
