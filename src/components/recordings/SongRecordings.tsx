"use client";

import { useMemo } from "react";

import { cn } from "@/components/ui/cn";
import { recordingsContent } from "@/content/recordings";
import type { MediaLink, Recording } from "@/lib/recordings/model";

import { RecordingDisclaimer } from "./RecordingNotes";
import { RecordingList } from "./RecordingList";
import { useViewerRecordings } from "./use-viewer-recordings";

/**
 * A song page's Recordings section. The page brings the public recordings
 * (the same for every visitor); a member's browser adds the members-only
 * ones, and someone who manages recordings gets the controls to change them.
 * A song with no recordings simply says so.
 */
export function SongRecordings({
  songId,
  songTitle,
  recordings,
  links,
  className,
}: {
  songId: string;
  songTitle: string;
  recordings: Recording[];
  links: MediaLink[];
  className?: string;
}) {
  const songIds = useMemo(() => [songId], [songId]);
  const viewer = useViewerRecordings({ recordings, links }, songIds);
  const hasAny = viewer.recordings.length > 0 || viewer.links.length > 0;

  return (
    <section aria-labelledby="recordings" className={cn(className)}>
      <h2 id="recordings" className="font-display text-2xl text-ink">
        {recordingsContent.song.title}
      </h2>
      <RecordingList
        songId={songId}
        songTitle={songTitle}
        recordings={viewer.recordings}
        links={viewer.links}
        canManage={viewer.canManage}
        // The action itself refreshes the page's data (useAction); this re-reads the members-only ones.
        onChanged={() => viewer.reload()}
        className="mt-4"
      />
      {hasAny ? <RecordingDisclaimer className="mt-5" /> : null}
    </section>
  );
}
