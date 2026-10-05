import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
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

/** Marks a link that opens a song's page (see songLinkProps). */
export const SONG_PAGE_LINK_ATTRIBUTE = "data-song-page";

/**
 * What every link to a song's page carries: the page opens in a new tab, so
 * the list being read - the song list, the archive, a service being planned -
 * stays as it was. Spread onto the link; SongLink does it itself.
 *
 * The installed app on a phone or tablet has no tabs, so there these links
 * open in place instead (src/components/app/InstalledApp.tsx finds them by
 * the attribute).
 */
export const songLinkProps = { target: "_blank", rel: "noopener", [SONG_PAGE_LINK_ATTRIBUTE]: "" } as const;

/** For screen readers, after the title of a link carrying songLinkProps. */
export function NewTabNote() {
  return <span className="sr-only"> {songListContent.newTab}</span>;
}

/** A song title that opens that song's page. */
export function SongLink({ title, className }: { title: string; className?: string }) {
  return (
    <Link href={songPath(songSlug(title))} {...songLinkProps} className={cn(songLinkClasses, className)}>
      {title}
      <NewTabNote />
    </Link>
  );
}
