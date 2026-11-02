import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { recordingsContent } from "@/content/recordings";

const copy = recordingsContent.preparation;

/**
 * "Listen" in a service card's footer: that service's Preparation Playlist.
 * A small gold play disc that fills on hover, and a gold underline that fades
 * in - the same hover as "Report a problem" beside it.
 */
export function ListenLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-10 items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink print:hidden",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-dark transition-[background-color,color,transform] duration-200 group-hover:bg-gold group-hover:text-paper group-active:scale-95"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="translate-x-px">
          <path d="M6 4l14 8-14 8V4z" />
        </svg>
      </span>
      <span className="underline decoration-transparent underline-offset-4 transition-colors duration-200 group-hover:decoration-gold">
        {copy.serviceLink}
      </span>
      <span className="sr-only"> — {copy.title}</span>
    </Link>
  );
}
