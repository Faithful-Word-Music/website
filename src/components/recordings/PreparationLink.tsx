import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { recordingsContent } from "@/content/recordings";

const copy = recordingsContent.preparation;

/** A wide link to the Preparation Playlists (the Library, the Dashboard). */
export function PreparationLink({ href = "/playlists", note = copy.lead, className }: { href?: string; note?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card transition-[border-color,box-shadow] hover:border-gold hover:shadow-lift sm:px-6",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-ink">{copy.entry}</span>
          <span className="block text-sm text-muted">{note}</span>
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-gold-dark transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
