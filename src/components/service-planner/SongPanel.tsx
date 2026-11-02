"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { RecordingDisclaimer } from "@/components/recordings/RecordingNotes";
import { RecordingList, type ServicePlace } from "@/components/recordings/RecordingList";
import { songLinkProps } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { recordingsContent } from "@/content/recordings";
import { servicePlannerContent } from "@/content/service-planner";
import type { MediaLink, Recording } from "@/lib/recordings/model";
import type { PlanSong } from "@/lib/service-planner/model";
import { songIdentity, songUrlSlug } from "@/lib/song-identity";
import { songPath } from "@/lib/song-list";

const ws = servicePlannerContent.workspace;
const panel = ws.songPanel;

/**
 * The song chosen in the workspace's list, with what belongs to it: its
 * recordings (the same catalog as its song page - one set of recordings,
 * changed by the same actions) and which one this service uses. Beside the
 * list on a computer; on a phone, the workspace shows it in a dialog.
 */
export function SongPanel({
  song,
  position,
  recordings,
  links,
  canManage,
  service,
  onClose,
  className,
  bare = false,
}: {
  song: PlanSong;
  position: number;
  recordings: Recording[];
  links: MediaLink[];
  canManage: boolean;
  service: ServicePlace;
  onClose?: () => void;
  className?: string;
  /** Inside a dialog that brings its own title and padding. */
  bare?: boolean;
}) {
  const router = useRouter();
  const songId = songIdentity(song);
  const own = recordings.filter((recording) => recording.songId === songId);
  const ownLinks = links.filter((link) => link.songId === songId);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="tnum">{ws.place.replace("{n}", String(position))}</span>
        {song.number ? <span className="tnum">#{song.number}</span> : null}
        {song.key ? (
          <span>
            {panel.keyLabel} <span className="tnum font-medium text-gold-dark">{song.key}</span>
          </span>
        ) : null}
        {song.insert ? <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold-dark">{ws.insert}</span> : null}
        <Link href={songPath(songUrlSlug(song))} {...songLinkProps} className="ml-auto font-medium text-ink underline decoration-dotted underline-offset-4 hover:text-gold-dark">
          {panel.openSong}
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-ink">{recordingsContent.planner.title}</h3>
      <RecordingList
        songId={songId}
        songTitle={song.title}
        recordings={own}
        links={ownLinks}
        canManage={canManage}
        service={service}
        onChanged={() => router.refresh()}
        className="mt-2"
      />
      {own.length > 0 ? <RecordingDisclaimer className="mt-4" /> : null}
    </>
  );

  if (bare) return <div className={className}>{body}</div>;

  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{panel.title}</p>
          <h2 className="mt-0.5 font-display text-xl text-ink">{song.title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={panel.close}
            className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {body}
    </Card>
  );
}
