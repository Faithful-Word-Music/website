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
 * The full name shows at every width. Even at 320px there is room: the
 * container's padding, the mark and the menu button take about 118px, leaving
 * roughly 200px for a wordmark that sets in about 170px.
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
      <span className="whitespace-nowrap font-display text-lg tracking-tight text-ink sm:text-xl">
        {siteConfig.name}
      </span>
    </Link>
  );
}
