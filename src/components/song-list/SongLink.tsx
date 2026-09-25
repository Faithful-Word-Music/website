import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { songSlug } from "@/lib/song-list";

/**
 * A song title that opens that song's page in the archive. Looks like plain
 * text until hovered, so lists of songs still read as lists.
 */
export function SongLink({ title, className }: { title: string; className?: string }) {
  return (
    <Link
      href={`/song-list/archive/${songSlug(title)}`}
      className={cn(
        "decoration-gold decoration-1 underline-offset-4 transition-colors hover:underline",
        className,
      )}
    >
      {title}
    </Link>
  );
}
