"use client";

import { cn } from "@/components/ui/cn";
import { SectionNav } from "@/components/ui/SectionNav";
import { favoritesContent } from "@/content/favorites";

import { useFavorites } from "./FavoritesProvider";

/**
 * The Library's sections, as ordinary links. Only approved members see it:
 * a visitor's Library looks as it always has. New sections join this list
 * when they work, and not before.
 */
export const LIBRARY_SECTIONS = [
  { href: "/library", label: favoritesContent.sections.allSongs },
  { href: "/library/favorites", label: favoritesContent.sections.favorites },
];

export function LibrarySectionNav({ className }: { className?: string }) {
  const { access } = useFavorites();
  if (access === "blocked") return null;
  // Holds the row for someone who looks signed in, until their account is confirmed.
  if (access === "none") return <div aria-hidden="true" className={cn("favorite-nav-slot", className)} />;
  return (
    <div className={className}>
      <SectionNav items={LIBRARY_SECTIONS} label={favoritesContent.sections.label} />
    </div>
  );
}
