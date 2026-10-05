"use client";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorChat } from "@/components/conductor/ConductorChat";
import { useConductor } from "@/components/conductor/conductor-store";
import { Button } from "@/components/ui/Button";
import { conductorContent } from "@/content/conductor";

/**
 * Conductor as a page of its own: the same conversation as the floating
 * panel (conductor-store.ts), given the whole page.
 *
 * Not a box with its own scrollbar. The conversation is part of the page and
 * the page scrolls, like any other; the box to type in stays at the bottom
 * of the window. With nothing said yet it simply fills the screen, so there
 * is nothing to scroll at all.
 */
export function ConductorWorkspace() {
  const { userId } = useAccount();
  const { session, reset } = useConductor(userId);

  return (
    <div className="flex flex-1 flex-col">
      {/* Only once there is a conversation to leave. */}
      {session.messages.length > 0 ? (
        <div className="animate-enter mx-auto flex w-full max-w-3xl justify-end border-b border-line pb-2">
          <Button type="button" variant="quiet" onClick={reset} className="-mr-3 px-3">
            {conductorContent.actions.newConversation}
          </Button>
        </div>
      ) : null}
      <ConductorChat variant="page" autoFocus />
    </div>
  );
}
