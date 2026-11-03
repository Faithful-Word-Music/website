import Link from "next/link";

import { Logo } from "@/components/layout/Logo";
import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";

/**
 * The logo lockup: the forte mark plus the wordmark.
 *
 * The mark carries the gold; the wordmark stays pure ink, so there is one
 * accent in the lockup rather than two competing ones.
 *
 * The full name shows at every width for visitors. `compact` is for the
 * signed-in header, whose bar also holds the bell and the avatar on a phone:
 * below 28rem there is no room for the wordmark beside four buttons, so only
 * the mark shows there. The name stays the link's accessible name (sr-only).
 */
export function Brand({
  className,
  href = "/",
  compact = false,
}: {
  className?: string;
  /** Mark only below 28rem (the signed-in header on a phone). */
  compact?: boolean;
  /** Where the logo leads: "/" for visitors, the Dashboard once signed in. */
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 transition-opacity hover:opacity-80",
        className,
      )}
    >
      <Logo size={32} className="shrink-0" />
      <span className={cn("whitespace-nowrap font-display text-lg tracking-tight text-ink sm:text-xl", compact && "max-[28rem]:sr-only")}>
        {siteConfig.name}
      </span>
    </Link>
  );
}
