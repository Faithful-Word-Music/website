"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorChat } from "@/components/conductor/ConductorChat";
import { ConductorHistory } from "@/components/conductor/ConductorHistory";
import { ConductorMark, HistoryIcon, NewChatIcon } from "@/components/conductor/ConductorMark";
import { useConductor } from "@/components/conductor/conductor-store";
import { cn } from "@/components/ui/cn";
import { modalDialogFocusClasses, modalDialogProps, useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePagePath } from "@/components/ui/use-page-path";
import { conductorContent } from "@/content/conductor";
import {
  clampDrawerWidth,
  DRAWER_DEFAULT_WIDTH,
  DRAWER_KEY_STEP,
  DRAWER_MEDIA_QUERY,
  DRAWER_WIDTH_KEY,
  drawerBounds,
  parseStoredWidth,
  widthFromPointer,
} from "@/lib/ai/conductor/drawer";
import { isActivePath } from "@/lib/navigation";

const copy = conductorContent;

/** Where Conductor is not offered: its own page, and the screens before anyone is signed in. */
const HIDDEN_ON = ["/conductor", "/login", "/accept-invite", "/request-access"];

/** The CSS variable the page and its fixed controls read to make room for the panel (globals.css). */
const INSET = "--conductor-inset";
/** The panel's own width. The same figure while it is open; kept while it slides away and the page takes its room back. */
const WIDTH = "--conductor-width";
/** Longer than either leaving animation: if its end is never reported, the panel still goes. */
const LEAVE_FALLBACK_MS = 500;

/**
 * Leaving, with an animation: `leave()` starts it, and `onGone` runs when it
 * has finished (the element reports it through `finished`) - or after a
 * moment regardless, so nothing can leave the panel stuck on screen.
 */
function useLeaving(onGone: () => void) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);
  const gone = useRef(false);

  const finished = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    window.clearTimeout(timer.current);
    onGone();
  }, [onGone]);

  const leave = useCallback(() => {
    setLeaving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(finished, LEAVE_FALLBACK_MS);
  }, [finished]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { leaving, leave, finished };
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

function subscribeToWindow(onChange: () => void) {
  const media = window.matchMedia(DRAWER_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** Whether there is room for the panel beside the page; false on the server and on a phone. */
function useWideScreen(): boolean {
  return useSyncExternalStore(subscribeToWindow, () => window.matchMedia(DRAWER_MEDIA_QUERY).matches, () => false);
}

/**
 * The width the panel is laid out against: the window without its scrollbar,
 * which is where a `fixed` element's right edge sits. (window.innerWidth
 * counts the scrollbar, and would put the edge that far from the pointer.)
 */
const layoutWidth = () => document.documentElement.clientWidth;

function useViewportWidth(): number {
  return useSyncExternalStore(subscribeToWindow, layoutWidth, () => 0);
}

function readStoredWidth(): number | null {
  try {
    return parseStoredWidth(window.localStorage.getItem(DRAWER_WIDTH_KEY));
  } catch {
    return null;
  }
}

function storeWidth(width: number | null) {
  try {
    if (width === null) window.localStorage.removeItem(DRAWER_WIDTH_KEY);
    else window.localStorage.setItem(DRAWER_WIDTH_KEY, String(width));
  } catch {
    // Storage is blocked: the width simply lasts until the page is reloaded.
  }
}

// ---------------------------------------------------------------------------
// The panel's header, shared by the drawer and the sheet
// ---------------------------------------------------------------------------

const iconButton =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors not-disabled:hover:bg-paper not-disabled:hover:text-ink disabled:opacity-40";

/** Which of its two faces the panel is showing: the conversation, or the list of saved ones. */
type PanelView = "chat" | "history";

function PanelHeader({
  headingId,
  view,
  onView,
  onClose,
}: {
  headingId: string;
  view: PanelView;
  onView: (view: PanelView) => void;
  onClose: () => void;
}) {
  const { userId } = useAccount();
  const { session, reset } = useConductor(userId);
  const listing = view === "history";

  return (
    // A container, so the header fits itself to the panel's own width (it is dragged), not the window's.
    <header className="@container flex shrink-0 items-center justify-between gap-2 border-b border-line py-2 pl-4 pr-2">
      <h2 id={headingId} className="flex min-w-0 items-center gap-2.5 font-display text-xl text-ink">
        <ConductorMark className="shrink-0 text-gold" />
        <span className="truncate">{listing ? copy.history.heading : copy.name}</span>
      </h2>
      <div className="flex shrink-0 items-center">
        <Link
          href="/conductor"
          aria-label={copy.actions.openFull}
          title={copy.actions.openFull}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          {/* Its words only where the panel has room for them beside the other controls. */}
          <span className="hidden @[26rem]:inline">{copy.actions.openFullShort}</span>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => onView(listing ? "chat" : "history")}
          aria-pressed={listing}
          aria-label={listing ? copy.history.back : copy.history.open}
          title={listing ? copy.history.back : copy.history.open}
          className={cn(iconButton, listing && "bg-paper text-ink")}
        >
          <HistoryIcon />
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            onView("chat");
          }}
          disabled={!listing && session.messages.length === 0 && !session.loading}
          aria-label={copy.actions.newConversation}
          title={copy.actions.newConversation}
          className={iconButton}
        >
          <NewChatIcon />
        </button>
        <button type="button" onClick={onClose} aria-label={copy.actions.close} title={copy.actions.close} className={iconButton}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Wide screens: a column beside the page, as wide as the person drags it
// ---------------------------------------------------------------------------

/**
 * Conductor beside the page. Not a dialog: the page stays live, and makes
 * room - <html> carries the panel's width (--conductor-inset) and the body
 * takes it as a margin (globals.css), so the header, the planner and
 * everything else re-fit to the space left rather than being covered.
 *
 * The left edge drags. While it moves, the width is written straight to that
 * variable once a frame - no React render per pixel - and only the width it
 * is released at is kept (state, and localStorage for next time). Arrow keys
 * move it too; a double-click puts it back.
 */
function Drawer({ onClosed }: { onClosed: () => void }) {
  const { leaving, leave: onClose, finished } = useLeaving(onClosed);
  const viewport = useViewportWidth();
  const [preferred, setPreferred] = useState<number | null>(() => readStoredWidth());
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<PanelView>("chat");
  const frame = useRef(0);
  const live = useRef(0);
  const headingId = useId();

  const bounds = drawerBounds(viewport);
  const width = clampDrawerWidth(preferred ?? DRAWER_DEFAULT_WIDTH, viewport);

  // The page makes room for exactly as long as the panel is there.
  useLayoutEffect(() => {
    const root = document.documentElement;
    // Leaving: the page takes its room back at once, as the panel slides away.
    root.style.setProperty(INSET, leaving ? "0px" : `${width}px`);
    root.style.setProperty(WIDTH, `${width}px`);
    root.dataset.conductor = "drawer";
    return () => {
      root.style.removeProperty(INSET);
      root.style.removeProperty(WIDTH);
      delete root.dataset.conductor;
    };
  }, [width, leaving]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const commit = useCallback((next: number | null) => {
    setPreferred(next);
    storeWidth(next);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    live.current = width;
    setDragging(true);
    // No transition while dragging (the page follows the pointer exactly), and no text selected along the way.
    document.documentElement.dataset.conductorResizing = "";
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    live.current = widthFromPointer(event.clientX, layoutWidth());
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty(INSET, `${live.current}px`);
      document.documentElement.style.setProperty(WIDTH, `${live.current}px`);
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cancelAnimationFrame(frame.current);
    delete document.documentElement.dataset.conductorResizing;
    setDragging(false);
    commit(live.current);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The edge is on the left: Left makes the panel wider, Right narrower.
    const next =
      event.key === "ArrowLeft"
        ? width + DRAWER_KEY_STEP
        : event.key === "ArrowRight"
          ? width - DRAWER_KEY_STEP
          : event.key === "Home"
            ? bounds.max
            : event.key === "End"
              ? bounds.min
              : null;
    if (next === null) return;
    event.preventDefault();
    commit(clampDrawerWidth(next, viewport));
  }

  return (
    <aside
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        // Escape closes it from inside - unless something within (none yet) has used the key.
        if (event.key === "Escape" && !event.defaultPrevented) onClose();
      }}
      data-leaving={leaving ? "" : undefined}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) finished();
      }}
      style={{ width: `var(${WIDTH})` }}
      className="conductor-drawer fixed inset-y-0 right-0 z-40 flex flex-col border-l border-line bg-surface shadow-lift print:hidden"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={copy.resize.label}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={width}
        title={copy.resize.hint}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => commit(null)}
        onKeyDown={onHandleKeyDown}
        // Wider than it looks: a 12px strip to catch, a hairline to see.
        className="group absolute inset-y-0 left-0 z-10 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center rounded-none focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-full w-px transition-colors group-hover:bg-gold group-focus-visible:bg-gold",
            dragging ? "bg-gold" : "bg-transparent",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute h-10 w-1 rounded-full transition-colors group-hover:bg-gold group-focus-visible:bg-gold",
            dragging ? "bg-gold" : "bg-staff",
          )}
        />
      </div>

      <PanelHeader headingId={headingId} view={view} onView={setView} onClose={onClose} />
      {view === "history" ? <ConductorHistory onDone={() => setView("chat")} className="flex-1" /> : <ConductorChat variant="panel" autoFocus />}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Phones and tablets: a sheet over the page
// ---------------------------------------------------------------------------

/** How far the sheet must be pulled down to close it. */
const DISMISS_AFTER = 110;
/** How much of the window must be covered at the bottom before it is taken for the keyboard. */
const KEYBOARD_AT_LEAST = 120;

/**
 * Conductor over the page: a sheet that rises from the bottom and stops short
 * of the top, so the page it was opened from still shows above it - this is
 * a visit, not a new page. A modal <dialog> like every other on the site
 * (useModalDialog): focus stays inside, the page behind neither scrolls nor
 * moves, and closing puts focus back where it was.
 *
 * It follows the visual viewport, not the layout one: when a phone's keyboard
 * opens, the sheet shrinks to the space above it and the composer stays in
 * view. Pulling its top down (the handle, or anywhere on the header) closes it, as does Escape or a tap outside.
 */
function Sheet({ onClosed }: { onClosed: () => void }) {
  const { leaving, leave, finished } = useLeaving(onClosed);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const pull = useRef<{ startY: number; dy: number } | null>(null);
  const [view, setView] = useState<PanelView>("chat");
  const headingId = useId();
  useModalDialog(dialogRef);

  useEffect(() => {
    const viewport = window.visualViewport;
    const sheet = sheetRef.current;
    if (!viewport || !sheet) return;
    function fit() {
      if (!viewport || !sheet) return;
      sheet.style.setProperty("--sheet-space", `${viewport.height}px`);
      // What the keyboard (or a browser bar) covers at the bottom of the layout viewport.
      const lift = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      sheet.style.setProperty("--sheet-lift", `${lift}px`);
      // That much is a keyboard, not a browser bar: the conversation tightens up to fit (ConductorChat).
      if (lift > KEYBOARD_AT_LEAST) sheet.dataset.keyboard = "";
      else delete sheet.dataset.keyboard;
    }
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, []);

  /**
   * Sends the sheet away: down off the screen from wherever it is, the page
   * behind brightening as it goes. Marked on the element first, in the same
   * breath as letting go of a pull, so it carries on down from where the
   * finger left it rather than springing back up for a frame.
   */
  function onClose() {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    if (dialog) dialog.dataset.leaving = "";
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.transform = "";
    }
    leave();
  }

  function onPullStart(event: ReactPointerEvent<HTMLDivElement>) {
    // The whole top of the sheet pulls - but its buttons and its link are still theirs to press.
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pull.current = { startY: event.clientY, dy: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }

  function onPullMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pull.current || !sheetRef.current) return;
    pull.current.dy = Math.max(0, event.clientY - pull.current.startY);
    sheetRef.current.style.transform = `translateY(${pull.current.dy}px)`;
  }

  function onPullEnd() {
    const sheet = sheetRef.current;
    const pulled = pull.current?.dy ?? 0;
    pull.current = null;
    if (!sheet) return;
    if (pulled > DISMISS_AFTER) return onClose();
    // Not far enough: back up to where it was.
    sheet.style.transition = "";
    sheet.style.transform = "";
  }

  return (
    <dialog
      ref={dialogRef}
      {...modalDialogProps}
      aria-labelledby={headingId}
      data-leaving={leaving ? "" : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        "conductor-dialog fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-black/45 backdrop:backdrop-blur-[2px] print:hidden",
        modalDialogFocusClasses,
      )}
    >
      <div
        ref={sheetRef}
        onTransitionEnd={(event) => {
          if (leaving && event.target === event.currentTarget && event.propertyName === "transform") finished();
        }}
        className="conductor-sheet absolute inset-x-0 mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-b-0 border-line bg-surface shadow-lift"
      >
        {/* The handle says "this pulls down" - and the whole top of the sheet does, header included,
            as on a native sheet: a finger does not have to find the little line. */}
        <div
          onPointerDown={onPullStart}
          onPointerMove={onPullMove}
          onPointerUp={onPullEnd}
          onPointerCancel={onPullEnd}
          className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <div className="flex justify-center pb-1.5 pt-3">
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-staff" />
          </div>
          <PanelHeader headingId={headingId} view={view} onView={setView} onClose={onClose} />
        </div>
        {view === "history" ? <ConductorHistory onDone={() => setView("chat")} className="flex-1" /> : <ConductorChat variant="panel" />}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// The launcher, and which of the two it opens
// ---------------------------------------------------------------------------

function Launcher({ onOpen }: { onOpen: () => void }) {
  // Tells "Back to top" to sit above it (BackToTop.tsx), only while it shows.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.conductor = "launcher";
    return () => {
      if (root.dataset.conductor === "launcher") delete root.dataset.conductor;
    };
  }, []);

  return (
    <button
      type="button"
      data-conductor-launcher=""
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={copy.actions.open}
      title={copy.actions.open}
      className={cn(
        // The same lifted, bordered surface as "Back to top": part of the site, not a widget on it.
        "conductor-launcher group fixed right-7 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-lift sm:right-8 print:hidden",
        // Under the pointer it rises and grows a touch, unhurried, and settles back the same way;
        // pressed, it gives quickly. Longer than the site's usual 250ms: a float, not a snap.
        "transition-[transform,translate,scale,rotate,border-color,background-color,bottom] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-1 hover:scale-[1.06] hover:border-gold focus-visible:border-gold active:translate-y-0 active:scale-[0.96] active:duration-150",
        // Steps aside for the song list's share bar, which takes the bottom of the screen.
        "[:root[data-share-bar]_&]:invisible app-login:hidden",
        // ...and for the open mobile menu, which takes the whole screen (Header.tsx).
        "[:root[data-nav-menu]_&]:invisible",
      )}
    >
      {/* The mark alone: a quiet round button in the corner, like "Back to top" above it. */}
      {/* The baton lifts into its upbeat, a little after the button starts to rise. */}
      <ConductorMark
        size={20}
        className="text-gold transition-transform delay-75 duration-700 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:-rotate-[18deg] group-hover:scale-110 group-active:rotate-0"
      />
    </button>
  );
}

/**
 * Conductor, wherever the person is working: a button in the corner of every
 * signed-in page, for someone holding use_ai, that opens the conversation
 * without leaving the page - beside it on a wide screen (Drawer), over it on
 * a phone (Sheet). Mounted once, in the root layout, so it survives moving
 * between pages.
 *
 * It is the same conversation as the Conductor page (conductor-store.ts), and
 * the same view of it (ConductorChat); only the frame differs. On the
 * Conductor page itself it is not shown at all.
 *
 * Showing the button is a convenience. /api/conductor checks use_ai itself.
 */
export function ConductorDock() {
  const { nav } = useAccount();
  const pathname = usePagePath();
  const wide = useWideScreen();
  const [open, setOpen] = useState(false);
  /** After closing, focus goes back to the button that opened it. */
  const refocus = useRef(false);

  const allowed = nav.signedIn && nav.permissions.has("use_ai");
  const hidden = HIDDEN_ON.some((path) => isActivePath(pathname, path));

  // Arriving at the Conductor page (by "Open full Conductor", or any other way) puts the panel away.
  if (open && (hidden || !allowed)) setOpen(false);

  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    document.querySelector<HTMLButtonElement>("[data-conductor-launcher]")?.focus({ preventScroll: true });
  }, [open]);

  if (!allowed || hidden) return null;

  if (!open) {
    return <Launcher onOpen={() => setOpen(true)} />;
  }

  return wide ? <Drawer onClosed={close} /> : <Sheet onClosed={close} />;
}
