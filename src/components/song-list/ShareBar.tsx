"use client";

import { useEffect } from "react";

import { ShareButton } from "@/components/song-list/ShareButton";
import { songListContent } from "@/content/song-list";
import type { Service } from "@/types/song-list";

/**
 * The bar pinned to the bottom of the screen in select mode: how many
 * services are ticked, Share, and Done.
 *
 * While it is up, the page's "Back to top" button steps aside (it would sit
 * on top of the bar) - via a data attribute on <html>, see BackToTop.
 */
export function ShareBar({
  services,
  note,
  onDone,
}: {
  /** The ticked services, whole. */
  services: Service[];
  note: string | null;
  onDone: () => void;
}) {
  const { share } = songListContent;
  const count = services.length;

  useEffect(() => {
    document.documentElement.dataset.shareBar = "";
    return () => {
      delete document.documentElement.dataset.shareBar;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="region"
        aria-label={share.share}
        className="glass animate-enter pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5"
      >
        <p aria-live="polite" className="tnum min-w-0 flex-1 truncate text-sm text-ink-soft">
          {count > 0
            ? share.selectedCount.replace("{count}", String(count))
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
          note={note}
          placement="above"
          disabled={count === 0}
        />
      </div>
    </div>
  );
}
