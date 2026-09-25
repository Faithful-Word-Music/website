import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { songSlug } from "@/lib/song-list";

/**
 * A song title in the archive that opens that song's page. With a mouse it
 * looks like plain text until hovered, so the list still reads as a list. On
 * a touch screen there is no hover to find it by, so it carries a faint gold
 * underline from the start - a tap should never be a surprise.
 */
export function SongLink({ title, className }: { title: string; className?: string }) {
  return (
    <Link
      href={`/song-list/archive/${songSlug(title)}`}
      className={cn(
        "decoration-gold decoration-1 underline-offset-4 transition-colors hover:underline",
        "pointer-coarse:underline pointer-coarse:decoration-gold/50",
        className,
      )}
    >
      {title}
    </Link>
  );
}
