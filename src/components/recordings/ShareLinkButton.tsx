"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  canShareNatively,
  copyText,
  emailHref,
  prefersShareSheet,
  shareNatively,
} from "@/components/song-list/share-actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { SHARE_MENU_ICONS, ShareIcon } from "@/components/ui/share-icons";
import { recordingsContent } from "@/content/recordings";

const copy = recordingsContent.preparation.share;

/**
 * Shares a page's link (a playlist's). On a phone it goes straight to the
 * share sheet; on a computer it opens a small menu: copy the link, email it,
 * or the system share panel where the browser has one. If the share sheet
 * can't open, the menu opens instead.
 *
 * The link comes from the server (the site's canonical address), so a link
 * copied on a preview build still points at the real site.
 */
export function ShareLinkButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function onClick() {
    if (open) return setOpen(false);
    if (prefersShareSheet() && (await shareNatively({ title, url }))) return;
    setOpen(true);
  }

  function close({ refocus = false } = {}) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  async function select(item: MenuItem) {
    close({ refocus: true });
    const message = await item.run?.();
    if (message) setStatus(message);
  }

  const items: MenuItem[] = [];
  if (open) {
    items.push(
      {
        key: "copy",
        label: copy.copyLink,
        icon: SHARE_MENU_ICONS.copy,
        run: async () => ((await copyText(url)) ? copy.linkCopied : copy.copyFailed),
      },
      {
        key: "email",
        label: copy.email,
        icon: SHARE_MENU_ICONS.mail,
        href: emailHref({ title, text: url }),
        run: () => null,
      },
    );
    if (canShareNatively()) {
      items.push({
        key: "more",
        label: copy.moreOptions,
        icon: SHARE_MENU_ICONS.more,
        heavyIcon: true,
        run: () => void shareNatively({ title, url }),
      });
    }
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        aria-haspopup="menu"
        aria-expanded={open ? true : undefined}
        aria-controls={open ? menuId : undefined}
        className={buttonClasses("secondary")}
      >
        <ShareIcon />
        {copy.button}
      </button>

      {/* Confirms a copy. Always present, so screen readers announce the change. */}
      <span
        role="status"
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-opacity duration-200",
          status ? "opacity-100" : "opacity-0",
        )}
      >
        {status}
      </span>

      {open ? (
        <Menu
          id={menuId}
          menuRef={menuRef}
          triggerRef={triggerRef}
          placement="below"
          items={items}
          onSelect={select}
          onClose={close}
        />
      ) : null}
    </span>
  );
}
