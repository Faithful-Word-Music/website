"use client";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorChat } from "@/components/conductor/ConductorChat";
import { ConductorMark, NewChatIcon } from "@/components/conductor/ConductorMark";
import { useConductor } from "@/components/conductor/conductor-store";
import { cn } from "@/components/ui/cn";
import { conductorContent } from "@/content/conductor";

const copy = conductorContent;

/**
 * Conductor as a page of its own: the same conversation as the floating
 * panel (conductor-store.ts), given the whole page.
 *
 * Laid out as a chat, not as an article: one centred column holds everything
 * - a slim bar with the name and the conversation's controls, the
 * conversation, the box to type in - so nothing sits off to one side of
 * anything else. The bar stays under the site's header as the page scrolls.
 *
 * Not a box with its own scrollbar. The conversation is part of the page and
 * the page scrolls, like any other; the box to type in stays at the bottom
 * of the window. With nothing said yet it simply fills the screen, so there
 * is nothing to scroll at all.
 */
export function ConductorWorkspace() {
  const { userId } = useAccount();
  const { session, reset } = useConductor(userId);
  const started = session.messages.length > 0;

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
            <h1 className="flex min-w-0 items-center gap-2.5 font-display text-xl text-ink">
              <ConductorMark className="shrink-0 text-gold" />
              <span className="truncate">{copy.name}</span>
            </h1>
            <span className="hidden shrink-0 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
              {copy.tag}
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={!started}
            aria-label={copy.actions.newConversation}
            title={copy.actions.newConversation}
            className={cn(
              "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-medium text-ink transition-colors",
              "not-disabled:hover:border-gold disabled:opacity-40",
              // The icon alone on a phone; with its words where there is room.
              "w-10 sm:w-auto sm:px-3.5",
            )}
          >
            <NewChatIcon />
            <span className="hidden sm:inline">{copy.actions.newConversationShort}</span>
          </button>
        </div>
      </div>
      <ConductorChat variant="page" autoFocus />
    </div>
  );
}
