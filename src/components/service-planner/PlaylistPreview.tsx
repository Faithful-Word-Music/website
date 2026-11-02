"use client";

import { useMemo } from "react";

import { PreparationPlayer } from "@/components/recordings/PreparationPlayer";
import { Modal } from "@/components/ui/Modal";
import { recordingsContent } from "@/content/recordings";
import type { Recording, RecordingSelection } from "@/lib/recordings/model";
import { playlistService } from "@/lib/recordings/playlist";
import type { PlanSlots } from "@/lib/service-planner/model";
import type { ServiceSlot } from "@/types/song-list";

const copy = recordingsContent.planner;

/**
 * The service's Preparation Playlist as it will be once published - for the
 * planner only, from the data their own (signed-in, uncached) page already
 * holds. Opening it publishes nothing and is never shown to anyone else.
 */
export function PlaylistPreview({
  service,
  slots,
  places,
  recordings,
  selections,
  onClose,
}: {
  service: { date: string; slot: ServiceSlot; startsAt: string; label: string | null };
  slots: PlanSlots;
  places: string[];
  recordings: Recording[];
  selections: RecordingSelection[];
  onClose: () => void;
}) {
  const playlist = useMemo(
    () => playlistService({ ...service, status: "draft", slots, places }, selections),
    [service, slots, places, selections],
  );

  return (
    <Modal title={copy.previewTitle} subtitle={copy.previewNote} closeLabel={recordingsContent.manage.cancel} onClose={onClose} size="lg">
      <PreparationPlayer
        draft
        recordings={recordings}
        sections={[{ id: `preview-${playlist.id}`, title: playlist.title, subtitle: playlist.dateLabel, items: playlist.items }]}
        stacked
      />
    </Modal>
  );
}
