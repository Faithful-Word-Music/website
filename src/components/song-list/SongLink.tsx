import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { songPath, songSlug } from "@/lib/song-list";

const base =
  "underline decoration-dotted decoration-gold/55 decoration-1 underline-offset-4 transition-[text-decoration-color,color] print:no-underline";

/**
 * How a song title that opens its song page looks. A faint dotted gold underline is
 * always there, so it reads as a link without shouting; hovering turns it solid.
 */
export const songLinkClasses = cn(base, "hover:text-gold-dark hover:decoration-solid hover:decoration-gold");

/** The same look for a title inside a larger link that is the hover target. */
export const songLinkGroupClasses = cn(base, "group-hover:text-gold-dark group-hover:decoration-solid group-hover:decoration-gold");

/** A song title that opens that song's page. */
export function SongLink({ title, className }: { title: string; className?: string }) {
  return (
    <Link href={songPath(songSlug(title))} className={cn(songLinkClasses, className)}>
      {title}
    </Link>
  );
}
