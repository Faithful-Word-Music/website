"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { Modal } from "@/components/ui/Modal";
import { usePagePath } from "@/components/ui/use-page-path";
import { adminContent } from "@/content/admin";
import type { AdminIconName } from "@/lib/admin-sections";
import { currentHref, isGroupOpen, toggleGroup, type GroupToggles } from "@/lib/current-href";

const copy = adminContent.nav;

/** A page of the admin area: a link. */
export type AdminNavLink = { href: string; label: string; icon: AdminIconName; badge?: number; children?: undefined };

/**
 * A group of pages (AI). NOT a link: it leads nowhere itself. Pressing it
 * only opens or closes the list of its own pages.
 */
export type AdminNavParent = { id: string; label: string; icon: AdminIconName; children: Array<{ href: string; label: string }> };

export type AdminNavItem = AdminNavLink | AdminNavParent;

export type AdminNavGroup = { label?: string; items: AdminNavItem[] };

/**
 * The admin area's navigation. Only sections the person may use are passed in
 * (src/lib/admin-sections.ts decides which).
 *
 * From `lg` up it is a rail beside the page: grouped sections. Below that the
 * rail would crowd the page, so it is one button naming the open section,
 * which opens the same list in a dialog. Nothing scrolls sideways.
 *
 * A row is either a page or a group of pages, never both. A page is a link.
 * A group is a button with a chevron that only opens and closes its own list
 * - on the rail and in the dialog alike it goes nowhere, and in the dialog it
 * leaves the dialog open; only choosing one of its pages navigates (and closes
 * the dialog). A group starts open when the page is one of its own, and can be
 * opened from anywhere else to look (isGroupOpen in src/lib/current-href.ts).
 *
 * (The Plan / Inserts / Archive row inside a feature is not this: that is
 * SectionNav, src/components/ui/SectionNav.tsx.)
 */
export function AdminSidebar({ groups, note }: { groups: AdminNavGroup[]; note?: string }) {
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  // Shared by the rail and the dialog, and kept while moving between admin pages.
  const [toggles, setToggles] = useState<GroupToggles>({});

  const items = groups.flatMap((group) => group.items);
  // Every page there is, a group's own included: the page is in exactly one of them.
  const current = currentHref(
    items.flatMap((item) => item.children ?? [item]),
    pathname,
  );
  const section = items.find((item) => (item.children ? item.children.some((child) => child.href === current) : item.href === current));
  const page = section?.children?.find((child) => child.href === current);
  const waiting = items.reduce((sum, item) => sum + (item.children ? 0 : (item.badge ?? 0)), 0);

  const list = (tone: "rail" | "sheet", onNavigate?: () => void) => (
    <SectionList
      groups={groups}
      current={current}
      tone={tone}
      isOpen={(parent) => isGroupOpen(parent, pathname, toggles)}
      onToggle={(parent) => setToggles((now) => toggleGroup(parent, pathname, now))}
      onNavigate={onNavigate}
    />
  );

  return (
    <>
      <nav aria-label={copy.label} className="lg:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-sm transition-colors hover:border-gold"
        >
          {section ? <Icon name={section.icon} className="shrink-0 text-gold-dark" /> : null}
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            <span className="sr-only">{copy.menu}: </span>
            {section?.label ?? copy.label}
            {page ? <span className="font-normal text-muted"> · {page.label}</span> : null}
          </span>
          {waiting ? <Badge count={waiting} /> : null}
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted">
            <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
      </nav>

      <nav aria-label={copy.label} className="hidden lg:block">
        {list("rail")}
        {note ? <p className="mt-6 px-3 text-xs text-muted">{note}</p> : null}
      </nav>

      {open ? (
        <Modal title={copy.label} closeLabel={copy.close} onClose={() => setOpen(false)} bare bodyClassName="p-3">
          {list("sheet", () => setOpen(false))}
        </Modal>
      ) : null}
    </>
  );
}

/** The grouped sections. On the rail it sits on the page; in the sheet, on a card. */
function SectionList({
  groups,
  current,
  tone,
  isOpen,
  onToggle,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  /** The address of the page that is open, among every page listed. */
  current: string | undefined;
  tone: "rail" | "sheet";
  isOpen: (parent: AdminNavParent) => boolean;
  onToggle: (parent: AdminNavParent) => void;
  /** A page was chosen: the dialog closes. Never called for a group, which goes nowhere. */
  onNavigate?: () => void;
}) {
  // The rail and the dialog can both be in the page at once (one is only hidden), so each list names its own parts.
  const listId = useId();
  const here = cn("font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]", tone === "rail" ? "bg-surface" : "bg-paper");
  const elsewhere = cn("text-muted hover:text-ink", tone === "rail" ? "hover:bg-surface/60" : "hover:bg-paper/60");
  const row = "group relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors lg:min-h-10";

  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              if (!item.children) {
                const active = item.href === current;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate} className={cn(row, active ? here : elsewhere)}>
                      <Marker shown={active} />
                      <Icon name={item.icon} className={cn("shrink-0 transition-colors", active ? "text-gold-dark" : "group-hover:text-ink")} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? <Badge count={item.badge} /> : null}
                    </Link>
                  </li>
                );
              }

              // A group: the highlight belongs to whichever of its pages is open, never to the group itself.
              const holds = item.children.some((child) => child.href === current);
              const expanded = isOpen(item);
              const pagesId = `${listId}-${item.id}`;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={pagesId}
                    onClick={() => onToggle(item)}
                    className={cn(row, holds ? "font-medium text-ink" : elsewhere)}
                  >
                    <Icon name={item.icon} className={cn("shrink-0 transition-colors", holds ? "text-gold-dark" : "group-hover:text-ink")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className={cn("shrink-0 text-muted transition-transform group-hover:text-ink", expanded && "rotate-90")}
                    >
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {/* Slides open like every fold on the site; closed, it is inert, so its links cannot be tabbed to. */}
                  <Collapse open={expanded} id={pagesId}>
                    {/* A hair of room on three sides: the open page's outline is drawn outside its row, and a fold clips. */}
                    <ul className="ml-5 space-y-0.5 border-l border-line py-0.5 pl-3 pr-px">
                      {item.children.map((child) => {
                        const childActive = child.href === current;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={childActive ? "page" : undefined}
                              onClick={onNavigate}
                              className={cn(row, childActive ? here : elsewhere)}
                            >
                              <Marker shown={childActive} />
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </Collapse>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The gold bar down the open row's left edge. */
function Marker({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-gold transition-opacity",
        shown ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">{count}</span>
  );
}

const ICONS: Record<AdminIconName, string> = {
  overview: "M2.5 2.5H7V7H2.5zM9 2.5h4.5V7H9zM2.5 9H7v4.5H2.5zM9 9h4.5v4.5H9z",
  requests: "M2.5 9.5 4 3.5h8l1.5 6v3h-11zM2.5 9.5h3l.8 1.5h3.4l.8-1.5h3",
  invitations: "M2.5 4h11v8.5h-11zM2.5 4.5 8 9l5.5-4.5",
  users:
    "M6 7.5A2.25 2.25 0 1 0 6 3a2.25 2.25 0 0 0 0 4.5ZM2 13c.3-2.2 1.9-3.5 4-3.5s3.7 1.3 4 3.5M10.5 7.3a2 2 0 1 0-.6-3.9M11.5 9.6c1.4.3 2.3 1.5 2.5 3.4",
  roles: "M8 2 3 4v3.8c0 3 2 5.2 5 6.2 3-1 5-3.2 5-6.2V4zM6 8l1.5 1.5 2.7-2.9",
  configuration:
    "M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M11.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7.5 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  notifications: "M4 11.5V7a4 4 0 0 1 8 0v4.5M2.5 11.5h11M6.5 13.5a1.6 1.6 0 0 0 3 0",
  ai: "M7 2.5 8.2 6l3.3 1-3.3 1.2L7 11.5 5.8 8.2 2.5 7l3.3-1zM12 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z",
};

function Icon({ name, className }: { name: AdminIconName; className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
