"use client";

import Link from "next/link";
import { useState } from "react";

import { currentHref } from "@/components/admin/current-href";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { usePagePath } from "@/components/ui/use-page-path";
import { adminContent } from "@/content/admin";

const copy = adminContent.nav;

export type AdminIconName = keyof typeof ICONS;

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  badge?: number;
  /** Pages inside this section, listed under it while it is open. */
  children?: Array<{ href: string; label: string }>;
};

export type AdminNavGroup = { label?: string; items: AdminNavItem[] };

/**
 * The admin area's navigation. Only sections the person may use are passed in.
 *
 * From `lg` up it is a rail beside the page: grouped sections, and a section's
 * own pages (AI's) listed under it while it is open. Below that the rail would
 * crowd the page, so it is one button naming the open section, which opens the
 * same list in a dialog. Nothing scrolls sideways.
 */
export function AdminSidebar({ groups, note }: { groups: AdminNavGroup[]; note?: string }) {
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);

  const items = groups.flatMap((group) => group.items);
  const current = currentHref(items, pathname);
  const section = items.find((item) => item.href === current);
  const currentChild = section?.children ? currentHref(section.children, pathname) : undefined;
  const page = section?.children?.find((child) => child.href === currentChild);
  const waiting = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

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
        <SectionList groups={groups} current={current} currentChild={currentChild} tone="rail" />
        {note ? <p className="mt-6 px-3 text-xs text-muted">{note}</p> : null}
      </nav>

      {open ? (
        <Modal title={copy.label} closeLabel={copy.close} onClose={() => setOpen(false)} bare bodyClassName="p-3">
          <SectionList
            groups={groups}
            current={current}
            currentChild={currentChild}
            tone="sheet"
            onNavigate={() => setOpen(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}

/** The grouped sections. On the rail it sits on the page; in the sheet, on a card. */
function SectionList({
  groups,
  current,
  currentChild,
  tone,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  current: string | undefined;
  currentChild: string | undefined;
  tone: "rail" | "sheet";
  onNavigate?: () => void;
}) {
  const here = cn("font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]", tone === "rail" ? "bg-surface" : "bg-paper");
  const elsewhere = cn("text-muted hover:text-ink", tone === "rail" ? "hover:bg-surface/60" : "hover:bg-paper/60");
  const row = "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors lg:min-h-10";

  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === current;
              // An open section with pages of its own hands the highlight to the page.
              const unfolded = active && Boolean(item.children?.length);
              const lit = active && !unfolded;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={lit ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(row, lit ? here : unfolded ? "font-medium text-ink" : elsewhere)}
                  >
                    <Marker shown={lit} />
                    <Icon
                      name={item.icon}
                      className={cn("shrink-0 transition-colors", active ? "text-gold-dark" : "group-hover:text-ink")}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? <Badge count={item.badge} /> : null}
                  </Link>
                  {unfolded ? (
                    <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-line pl-3">
                      {item.children?.map((child) => {
                        const childActive = child.href === currentChild;
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
                  ) : null}
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

const ICONS = {
  overview: "M2.5 2.5H7V7H2.5zM9 2.5h4.5V7H9zM2.5 9H7v4.5H2.5zM9 9h4.5v4.5H9z",
  requests: "M2.5 9.5 4 3.5h8l1.5 6v3h-11zM2.5 9.5h3l.8 1.5h3.4l.8-1.5h3",
  invitations: "M2.5 4h11v8.5h-11zM2.5 4.5 8 9l5.5-4.5",
  users:
    "M6 7.5A2.25 2.25 0 1 0 6 3a2.25 2.25 0 0 0 0 4.5ZM2 13c.3-2.2 1.9-3.5 4-3.5s3.7 1.3 4 3.5M10.5 7.3a2 2 0 1 0-.6-3.9M11.5 9.6c1.4.3 2.3 1.5 2.5 3.4",
  roles: "M8 2 3 4v3.8c0 3 2 5.2 5 6.2 3-1 5-3.2 5-6.2V4zM6 8l1.5 1.5 2.7-2.9",
  configuration:
    "M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M11.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7.5 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  ai: "M7 2.5 8.2 6l3.3 1-3.3 1.2L7 11.5 5.8 8.2 2.5 7l3.3-1zM12 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z",
} as const;

function Icon({ name, className }: { name: AdminIconName; className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
