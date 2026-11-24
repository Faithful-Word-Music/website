"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { favoritesContent } from "@/content/favorites";

import { useFavorites, useFavoriteView, useObservedFavorite } from "./FavoritesProvider";

const copy = favoritesContent;

/**
 * The heart. Filled means saved and outlined means not, so the state never
 * rests on colour alone. It is always a sibling of a song's link, never inside
 * one. Nothing shows until the account is known, so an unknown state cannot be
 * mistaken for "not saved".
 */
export function FavoriteButton({
  songId,
  title,
  labelled = false,
  className,
}: {
  songId: string;
  title: string;
  /** With its words beside it, for a song's own page. */
  labelled?: boolean;
  className?: string;
}) {
  const { access, controller } = useFavorites();
  const view = useFavoriteView(songId);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [panelOpen, setPanelOpen] = useState(false);

  useObservedFavorite(rootRef, songId, access === "member" && controller !== null);

  const uncertain = view.status === "uncertain";
  const showPanel = (uncertain && panelOpen) || Boolean(view.error);

  useEffect(() => {
    if (!showPanel) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        buttonRef.current?.focus();
      } else if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setPanelOpen(false);
      controller?.clearError(songId);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [showPanel, controller, songId]);

  if (access === "none") return null;
  const status = access === "blocked" ? "blocked" : controller ? view.status : "loading";

  // An identity that can never be saved shows no control in a list; its own page says why.
  if (status === "unsupported" && !labelled) return <span ref={rootRef} aria-hidden="true" className="inline-flex size-px" />;

  const usable = status === "ready" || status === "uncertain";
  const filled = usable && view.favorited;
  const label = (status === "loading" ? copy.button.loading
    : status === "unsupported" ? copy.button.unsupported
    : status === "blocked" || status === "unavailable" ? copy.button.blocked
    : status === "uncertain" ? copy.button.uncertain
    : view.favorited ? copy.button.remove
    : copy.button.add).replace("{title}", title);
  const words = status === "uncertain" ? copy.uncertainTitle
    : status === "unsupported" ? copy.errors["unsupported-song"]
    : filled ? copy.button.saved
    : copy.uncertainAdd;

  const onClick = () => {
    if (!controller) return;
    if (uncertain) {
      setPanelOpen((open) => !open);
      return;
    }
    if (status === "ready") controller.setFavorite(songId, !view.favorited);
  };

  const seen = view.observed === null ? copy.uncertainUnknown : view.observed ? copy.uncertainSaved : copy.uncertainNotSaved;

  return (
    <span ref={rootRef} className={cn("relative inline-flex shrink-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={usable ? (uncertain && view.observed === null ? "mixed" : view.favorited) : undefined}
        aria-disabled={usable ? undefined : true}
        aria-busy={view.pending || status === "loading" ? true : undefined}
        aria-expanded={uncertain ? showPanel : undefined}
        aria-controls={showPanel ? panelId : undefined}
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-colors motion-reduce:transition-none",
          labelled && "border border-line bg-surface px-4 text-sm",
          usable ? "hover:bg-gold/15" : "cursor-default",
          filled ? "text-gold-dark" : usable ? "text-muted hover:text-gold-dark" : "text-muted/50",
          view.pending && "opacity-70",
        )}
      >
        <span className="relative inline-flex">
          <Icon name="heart" size={18} strokeWidth={1.4} filled={filled} className={status === "loading" ? "animate-pulse motion-reduce:animate-none" : undefined} />
          {uncertain ? <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-ink ring-2 ring-surface" /> : null}
        </span>
        {labelled ? <span className="text-ink">{words}</span> : null}
      </button>

      {showPanel ? (
        <span
          id={panelId}
          role={view.error ? "alert" : "group"}
          aria-label={view.error ? undefined : copy.uncertainTitle}
          className="absolute right-0 top-full z-30 mt-1 block w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 text-left text-sm text-ink shadow-card"
        >
          {view.error ? (
            <span className="block">{view.error}</span>
          ) : (
            <>
              <span className="block font-medium">{copy.uncertainTitle}</span>
              <span className="mt-1 block text-muted">{copy.uncertainSeen.replace("{state}", seen)}</span>
              <span className="mt-2 flex flex-col gap-1">
                {[true, false].map((want) => (
                  <button
                    key={String(want)}
                    type="button"
                    onClick={() => {
                      setPanelOpen(false);
                      controller?.retryUncertain(songId, want);
                      buttonRef.current?.focus();
                    }}
                    className={cn(
                      "min-h-11 rounded-full border border-line px-3 text-sm transition-colors hover:bg-gold/15 motion-reduce:transition-none",
                      view.intended === want && "font-medium",
                    )}
                  >
                    {want ? copy.uncertainAdd : copy.uncertainRemove}
                  </button>
                ))}
              </span>
            </>
          )}
        </span>
      ) : null}
    </span>
  );
}
