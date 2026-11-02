import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import { captionText, type CardLeader } from "@/lib/leadership/board";
import { GUEST_NAME } from "@/lib/leadership/model";

const words = dashboardContent.leading;

/**
 * Who leads, on the service cards (Dashboard, song list, the Next card).
 * Kept quiet: it reads after the songs, never above them. The viewer's own
 * part is gold - easy to find, never loud. See cardLeaderView().
 *
 * A song's leader is a small tag with their photo, apart from the song's
 * "Last sung" line - never one sentence with it, which would read as if the
 * leader had last sung it.
 */

/** One person leads the whole service: said once, under its time, with their photo. */
export function ServiceLeaderLine({ leader, past = false, className }: { leader: CardLeader; past?: boolean; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm",
        leader.mine && !past ? "font-medium text-gold-dark" : past ? "text-muted" : "text-ink-soft",
        className,
      )}
    >
      <LeaderAvatar leader={leader} past={past} className="h-5 w-5" />
      <span className="min-w-0">{captionText(leader, words)}</span>
    </p>
  );
}

/**
 * One song's leader: a pill with their photo and name - "You" in gold for the
 * viewer's own, and a dashed "No leader yet" when no one leads it.
 */
export function LeaderTag({ leader, past = false, className }: { leader: CardLeader | null; past?: boolean; className?: string }) {
  const label = !leader ? words.noLeader : leader.mine ? words.tagYou : displayName(leader.name);
  return (
    <span
      title={leader && !leader.mine ? captionText(leader, words) : undefined}
      className={cn(
        // As tall as the "Last sung" text beside it (a 1rem line), so a row with a tag is no
        // taller than one without: 18px drawn, pulled in 1px top and bottom.
        "-my-px inline-flex h-[1.125rem] max-w-full shrink-0 items-center gap-1 rounded-full border pl-px pr-2 text-xs leading-none",
        !leader
          ? "border-dashed border-staff text-muted"
          : past
            ? "border-line text-muted"
            : leader.mine
              ? "border-gold/60 bg-gold/10 font-medium text-gold-dark"
              : "border-line bg-surface text-ink-soft",
        className,
      )}
    >
      <LeaderAvatar leader={leader} past={past} className="h-[0.875rem] w-[0.875rem]" />
      {leader ? <span className="sr-only">{words.tagLedBy} </span> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * A leader's face: their profile photo, else their initials, else (a guest,
 * or no one) a plain outline of a person.
 */
function LeaderAvatar({ leader, past, className }: { leader: CardLeader | null; past: boolean; className?: string }) {
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", className);

  if (leader?.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo, tiny and already sized by Clerk
      <img
        src={leader.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(base, "border border-line object-cover", past && "opacity-60 grayscale")}
      />
    );
  }

  const letters = leader && leader.name !== GUEST_NAME ? initials(leader.name) : "";
  if (letters) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          base,
          "text-[0.55rem] font-semibold tracking-wide",
          past ? "bg-staff/60 text-muted" : leader?.mine ? "bg-gold/25 text-gold-dark" : "bg-staff text-ink-soft",
        )}
      >
        {letters}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={cn(base, leader ? "bg-staff/60" : "border border-dashed border-staff", "text-muted")}>
      <svg viewBox="0 0 16 16" className="h-[70%] w-[70%]" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3.5 13.5c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** "Anselm Urban" -> "AU"; one word -> its first letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** "a guest" reads as "Guest" on a tag; names are shown as they are. */
function displayName(name: string): string {
  return name === GUEST_NAME ? "Guest" : name;
}
