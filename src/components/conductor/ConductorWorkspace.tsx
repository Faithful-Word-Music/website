"use client";

import { useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorChat } from "@/components/conductor/ConductorChat";
import { ConductorHistory } from "@/components/conductor/ConductorHistory";
import { ConductorMark, HistoryIcon, NewChatIcon } from "@/components/conductor/ConductorMark";
import { useConductor } from "@/components/conductor/conductor-store";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { conductorContent } from "@/content/conductor";

const copy = conductorContent;

/** The bar's two controls: the icon alone on a phone, with its words where there is room. */
const barButton = cn(
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-medium text-ink transition-colors",
  "not-disabled:hover:border-gold disabled:opacity-40",
  "w-10 sm:w-auto sm:px-3.5",
);

/**
 * Conductor as a page of its own: the same conversation as the floating
 * panel (conductor-store.ts), given the whole page.
 *
 * Laid out as a chat, not as an article: one centred column holds everything
 * - a slim bar with the name and the conversation's controls, the
 * conversation, the box to type in - so nothing sits off to one side of
 * anything else. The bar stays under the site's header as the page scrolls.
 * The saved conversations open over it, in a dialog, rather than taking a
 * column of their own.
 *
 * Not a box with its own scrollbar. The conversation is part of the page and
 * the page scrolls, like any other; the box to type in stays at the bottom
 * of the window. With nothing said yet it simply fills the screen, so there
 * is nothing to scroll at all.
 */
export function ConductorWorkspace() {
  const { userId } = useAccount();
  const { session, reset } = useConductor(userId);
  const [listing, setListing] = useState(false);
  const started = session.messages.length > 0 || session.loading;
  // The name is the page's heading; a conversation's own title sits beside it once it has one.
  const title = started ? session.title : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* Under the site's header (4rem), which is sticky too. */}
      <div className="sticky top-16 z-20 bg-paper">
        <div
          className={cn(
            "mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 border-b transition-colors",
            // A line under it only once there is a conversation to rule off.
            started ? "border-line" : "border-transparent",
          )}
        >
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="flex shrink-0 items-center gap-2.5 font-display text-xl text-ink">
              <ConductorMark className="shrink-0 text-gold" />
              <span>{copy.name}</span>
            </h1>
            {title ? (
              <span className="min-w-0 truncate text-sm text-muted">{title}</span>
            ) : (
              <span className="hidden shrink-0 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
                {copy.tag}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setListing(true)} aria-haspopup="dialog" aria-label={copy.history.open} title={copy.history.open} className={barButton}>
              <HistoryIcon />
              <span className="hidden sm:inline">{copy.history.openShort}</span>
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={!started}
              aria-label={copy.actions.newConversation}
              title={copy.actions.newConversation}
              className={barButton}
            >
              <NewChatIcon />
              <span className="hidden sm:inline">{copy.actions.newConversationShort}</span>
            </button>
          </div>
        </div>
      </div>
      <ConductorChat variant="page" autoFocus />

      {listing ? (
        <Modal title={copy.history.heading} closeLabel={copy.history.close} onClose={() => setListing(false)} size="lg" bare>
          <ConductorHistory onDone={() => setListing(false)} className="max-h-[60vh] min-h-64" />
        </Modal>
      ) : null}
    </div>
  );
}
