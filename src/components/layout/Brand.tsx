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
 * The name shortens on narrow screens. Tailwind's `hidden` is `display: none`,
 * which takes the hidden one out of the accessibility tree too, so the link is
 * announced with exactly one name rather than both run together.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2.5 transition-opacity hover:opacity-80",
        className,
      )}
    >
      <Logo size={32} className="shrink-0" />
      <span className="font-display text-lg tracking-tight text-ink sm:text-xl">
        <span className="hidden sm:inline">{siteConfig.name}</span>
        <span className="sm:hidden">{siteConfig.shortName}</span>
      </span>
    </Link>
  );
}
