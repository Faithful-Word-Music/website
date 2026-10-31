import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import { captionText, type CardLeader } from "@/lib/leadership/board";

/**
 * Who leads, on the service cards (Dashboard, song list, the Next card).
 * Kept quiet: it reads after the songs, never above them. The viewer's own
 * part is gold - easy to find, never loud. See cardLeaderView().
 */

/** One person leads the whole service: said once, under its time. */
export function ServiceLeaderLine({ leader, past = false, className }: { leader: CardLeader; past?: boolean; className?: string }) {
  return (
    <p
      className={cn(
        "text-sm",
        leader.mine && !past ? "font-medium text-gold-dark" : past ? "text-muted" : "text-ink-soft",
        className,
      )}
    >
      {captionText(leader, dashboardContent.leading)}
    </p>
  );
}

/**
 * One song's leader, at the start of its small grey line ("Led by Brian ·
 * Last sung 3 weeks ago"). No one: "No leader yet", grey.
 */
export function SongLeaderNote({ leader, past = false }: { leader: CardLeader | null; past?: boolean }) {
  return (
    <span className={cn(leader?.mine && !past ? "font-medium text-gold-dark" : leader && !past ? "text-ink-soft" : "text-muted")}>
      {captionText(leader, dashboardContent.leading)}
    </span>
  );
}

