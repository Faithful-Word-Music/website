"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  canCopyPicture,
  canShareFiles,
  canShareNatively,
  copyPicture,
  copyText,
  emailHref,
  prefersShareSheet,
  savePicture,
  shareNatively,
  sharePicture,
  type SharePayload,
} from "@/components/song-list/share-actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { formatServicesText, inDateOrder, shareTitle, SONG_LIST_URL } from "@/lib/share-services";
import { monthSlug } from "@/lib/song-list-pdf";
import type { Service } from "@/types/song-list";

/**
 * Shares services as text (share-services.ts) or as a picture
 * (service-picture.tsx, served by /song-list/image/[month]).
 *
 * Either way it opens a small menu first, since there are two formats. The
 * picture comes first - it is what people send most:
 *   - Phone: "Send as picture" / "Send as text", each into the share sheet.
 *     The picture goes with the song list link beside it.
 *   - Computer: copy or save the picture, copy the text, start an email, or
 *     (where the browser has one) the system share panel.
 *
 * A phone only lets a page share straight after a tap, so the picture cannot
 * be fetched after "Send as picture" is tapped. It is fetched the moment the
 * menu opens instead, and is ready by the time the choice is made.
 *
 * The menu is portalled to <body> and placed against the button, so no card
 * that follows - or the page's own stacking - can cover it.
 */
export function ShareButton({
  services,
  monthTitle,
  variant,
  label,
  placement = "below",
  disabled = false,
}: {
  services: Service[];
  /** The month tab these services are on - it addresses the picture. */
  monthTitle: string;
  /** "icon": the round button on a card. "primary": the button in the share bar. */
  variant: "icon" | "primary";
  /** The button's accessible name (icon) or its text (primary). */
  label: string;
  /** Which side of the button the menu opens on. */
  placement?: "below" | "above";
  disabled?: boolean;
}) {
  const { share } = songListContent;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const picture = usePicture(open ? pictureUrl(monthTitle, services) : null, shareTitle(services));

  const payload: SharePayload = {
    title: shareTitle(services),
    text: formatServicesText(services),
  };

  function close({ refocus = false } = {}) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  /** Runs a menu choice: closes the menu, then reports how it went, if it says. */
  async function select(item: MenuItem) {
    close({ refocus: true });
    const message = await item.run();
    if (message) setStatus(message);
  }

  const file = picture.state === "ready" ? picture.file : null;
  const pictureBusy = picture.state === "loading";
  const items: MenuItem[] = [];

  if (open) {
    if (prefersShareSheet()) {
      items.push(
        file && !canShareFiles(file)
          ? {
              key: "picture",
              label: share.savePicture,
              icon: ICONS.picture,
              run: () => savePicture(file),
            }
          : {
              key: "picture",
              label: share.sendPicture,
              icon: ICONS.picture,
              busy: pictureBusy,
              disabled: !file,
              run: () =>
                file ? void sharePicture(file, { title: payload.title, url: SONG_LIST_URL }) : null,
            },
      );
      items.push({
        key: "text",
        label: share.sendText,
        icon: ICONS.text,
        run: () => void shareNatively(payload),
      });
    } else {
      if (canCopyPicture()) {
        items.push({
          key: "copy-picture",
          label: share.copyPicture,
          icon: ICONS.picture,
          busy: pictureBusy,
          disabled: !file,
          run: async () =>
            file && (await copyPicture(file)) ? share.pictureCopied : share.copyFailed,
        });
      }
      items.push({
        key: "save-picture",
        label: share.savePicture,
        icon: ICONS.download,
        busy: pictureBusy,
        disabled: !file,
        run: () => (file ? savePicture(file) : null),
      });
      items.push({
        key: "copy",
        label: share.copy,
        icon: ICONS.copy,
        run: async () => ((await copyText(payload.text)) ? share.copied : share.copyFailed),
      });
      items.push({
        key: "email",
        label: share.email,
        icon: ICONS.mail,
        href: emailHref(payload),
        run: () => null,
      });
      if (canShareNatively()) {
        items.push({
          key: "more",
          label: share.systemShare,
          icon: ICONS.more,
          run: () => void shareNatively(payload),
        });
      }
    }
    if (picture.state === "error") {
      for (const item of items) {
        if (item.busy !== undefined) item.hint = share.pictureFailed;
      }
    }
  }

  const iconClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink aria-expanded:bg-paper aria-expanded:text-ink";
  const primaryClass = buttonClasses("primary", "md", "disabled:pointer-events-none disabled:opacity-40");

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open ? true : undefined}
        aria-controls={open ? menuId : undefined}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        className={variant === "icon" ? iconClass : primaryClass}
      >
        <ShareIcon />
        {variant === "primary" ? label : null}
      </button>

      {/* Confirms a copy. Always present, so screen readers announce the change. */}
      <span
        role="status"
        className={cn(
          "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-opacity duration-200",
          placement === "below" ? "top-full mt-1" : "bottom-full mb-2",
          status ? "opacity-100" : "opacity-0",
        )}
      >
        {status}
      </span>

      {open ? (
        <ShareMenu
          id={menuId}
          menuRef={menuRef}
          triggerRef={triggerRef}
          placement={placement}
          items={items}
          onSelect={select}
          onClose={close}
        />
      ) : null}
    </span>
  );
}

/** The picture's address: the month, and the services by id, in date order. */
function pictureUrl(monthTitle: string, services: Service[]): string {
  const ids = inDateOrder(services).map((service) => service.id).join(",");
  return `/song-list/image/${monthSlug(monthTitle)}?s=${encodeURIComponent(ids)}`;
}

type Picture = { state: "idle" | "loading" | "error" } | { state: "ready"; file: File };

/**
 * Fetches the picture while `url` is set, as a File named for the services.
 * The last one is kept, so opening the same menu again is instant.
 */
function usePicture(url: string | null, name: string): Picture {
  const [picture, setPicture] = useState<{ url: string; value: Picture } | null>(null);

  useEffect(() => {
    if (!url || picture?.url === url) return;
    const controller = new AbortController();
    // Marks the fetch as started; the result arrives below, asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicture({ url, value: { state: "loading" } });
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const file = new File([blob], `${name}.png`, { type: "image/png" });
        setPicture({ url, value: { state: "ready", file } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPicture({ url, value: { state: "error" } });
      });
    return () => controller.abort();
    // `picture` is left out on purpose: it changes as this fetch reports back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, name]);

  if (!url) return { state: "idle" };
  return picture?.url === url ? picture.value : { state: "loading" };
}

type MenuItem = {
  key: string;
  label: string;
  icon: string;
  /** What choosing it does; a returned string is shown as confirmation. */
  run: () => Promise<string | null> | string | null | void;
  /** A link instead of a button (the mailto:). */
  href?: string;
  disabled?: boolean;
  /** The picture is still being made: show a spinner. */
  busy?: boolean;
  /** A short note under the label, e.g. when the picture failed. */
  hint?: string;
};

function ShareMenu({
  id,
  menuRef,
  triggerRef,
  placement,
  items,
  onSelect,
  onClose,
}: {
  id: string;
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  placement: "below" | "above";
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  onClose: (options?: { refocus?: boolean }) => void;
}) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  // Sit against the button, right edges aligned, and follow it on scroll.
  useLayoutEffect(() => {
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!rect || !menu) return;
      const gap = 8;
      const top =
        placement === "below" ? rect.bottom + gap : rect.top - gap - menu.offsetHeight;
      setPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [menuRef, triggerRef, placement]);

  // The latest onClose, read by the listener below without re-subscribing it
  // on every render (the page re-renders each time its clock ticks).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus the first choice on opening; close on a press anywhere else.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuRef, triggerRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = all.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      // Handled here, so it does not also leave select mode.
      event.preventDefault();
      event.stopPropagation();
      onClose({ refocus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      all[event.key === "Home" ? 0 : all.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:bg-paper focus:text-ink focus:outline-none aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-soft";

  return createPortal(
    <div
      id={id}
      ref={menuRef}
      role="menu"
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        right: position?.right ?? 0,
      }}
      className={cn(
        "animate-enter z-50 min-w-52 rounded-card border border-line bg-surface p-1.5 shadow-card",
        // Transparent, not hidden, until placed: a hidden menu could not take focus.
        !position && "opacity-0",
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            {item.busy ? <Spinner /> : <MenuIcon d={item.icon} />}
            <span className="flex min-w-0 flex-col">
              <span>{item.label}</span>
              {item.hint ? <span className="text-xs text-muted">{item.hint}</span> : null}
            </span>
          </>
        );
        return item.href ? (
          <a key={item.key} href={item.href} role="menuitem" onClick={() => onSelect(item)} className={itemClass}>
            {content}
          </a>
        ) : (
          // aria-disabled rather than disabled, so a choice that is still
          // loading can hold keyboard focus instead of vanishing from it.
          <button
            key={item.key}
            type="button"
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            aria-busy={item.busy || undefined}
            onClick={item.disabled ? undefined : () => onSelect(item)}
            className={cn(itemClass, item.disabled && "text-muted")}
          >
            {content}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** 16px line icons for the menu. */
const ICONS = {
  text: "M3 4h10M3 7h10M3 10h6.5M3 13h4",
  picture:
    "M2.5 3.5h11a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5ZM2 10.5l3.2-3.2 2.8 2.8 1.8-1.8L14 12M10.5 6.25h.01",
  copy: "M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z",
  download: "M8 2v8M4.75 6.75 8 10l3.25-3.25M2.5 13.5h11",
  mail: "M2 4h12v8.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4Zm0 0 6 5 6-5",
  more: "M4 8h.01M8 8h.01M12 8h.01",
} as const;

function MenuIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={d === ICONS.more ? 2.4 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 animate-spin text-muted">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The familiar box with an arrow leaving it. */
function ShareIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10V1.75M5 4.5l3-3 3 3M5.5 7H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
