"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ExternalLink } from "@/components/ui/ExternalLink";

import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { recordingsContent } from "@/content/recordings";
import { deleteRecording, removeMediaLink, setPrimaryRecording, setServiceRecording } from "@/app/recordings/actions";
import type { RecordingChange } from "@/lib/recordings/changes";
import { LINK_SOURCE_LABELS } from "@/lib/recordings/links";
import { sortRecordings, type MediaLink, type Recording } from "@/lib/recordings/model";
import { isPlaylistCapable } from "@/lib/recordings/providers";
import type { SelectionState } from "@/lib/recordings/resolve";

import { ActionMenu } from "./ActionMenu";
import { recordingDetails, SourceAttribution } from "./RecordingNotes";
import { LinkForm, RecordingForm } from "./RecordingForms";
import { YouTubePlayer } from "./YouTubePlayer";

const copy = recordingsContent;

/** The service a list is shown for, in the planner: its place's recording can be chosen. */
export interface ServicePlace {
  anchor: string;
  placeId: string;
  planRevision: number | null;
  selection: SelectionState;
  /** Why a recording can't be chosen right now (unsaved changes), or null. */
  blocked: string | null;
}

/**
 * A song's recordings and other media - one list for the song page and the
 * Service Planner. Anyone can play a recording here (one at a time) and open
 * a link. Someone who manages recordings also adds, edits, deletes and
 * chooses the primary; in the planner they also choose which recording this
 * service uses. Every change is a server action that checks again; once it
 * has worked, `onChanged` gets the change, so the page can show it at once.
 *
 * A whole recording row plays it: the play button's hit area stretches over
 * the row, and the video opens inside that row. Its other controls (Open
 * original, the menu, the video) sit above that layer.
 */
export function RecordingList({
  songId,
  songTitle,
  recordings: unsorted,
  links,
  canManage,
  service,
  onChanged,
  className,
}: {
  songId: string;
  songTitle: string;
  recordings: Recording[];
  links: MediaLink[];
  canManage: boolean;
  service?: ServicePlace;
  onChanged: (change: RecordingChange) => void;
  className?: string;
}) {
  const recordings = sortRecordings(unsorted);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [editing, setEditing] = useState<{ kind: "recording"; recording?: Recording } | { kind: "link"; link?: MediaLink } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "recording"; item: Recording } | { kind: "link"; item: MediaLink } | null>(null);
  const { run, pending, stateOf } = useAction();
  const chosenId = service?.selection.kind === "chosen" ? service.selection.recordingId : null;

  const choose = (recordingId: string | null) => {
    if (!service || service.planRevision === null) return;
    void run(
      () => setServiceRecording({ anchor: service.anchor, placeId: service.placeId, planRevision: service.planRevision, recordingId }),
      {
        key: `choose-${recordingId ?? "primary"}`,
        toast: true,
        onOk: () => onChanged({ kind: "selection", placeId: service.placeId, songId, recordingId }),
      },
    );
  };
  const setPrimary = (recordingId: string | null) =>
    void run(() => setPrimaryRecording({ songId, recordingId }), {
      key: "primary",
      toast: true,
      onOk: () => onChanged({ kind: "primary", songId, recordingId }),
    });

  const empty = recordings.length === 0 && links.length === 0;

  return (
    <div className={className}>
      {service && service.selection.kind === "removed" ? (
        <p role="alert" className="mb-3 rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-sm text-ink">
          {copy.planner.removed}
        </p>
      ) : null}
      {service && chosenId && !recordings.some((recording) => recording.id === chosenId) ? (
        <p role="alert" className="mb-3 rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-sm text-ink">
          {copy.planner.unavailable}
        </p>
      ) : null}

      {empty ? <p className="text-sm text-muted">{copy.song.none}</p> : null}

      {recordings.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {recordings.map((recording) => {
            const details = recordingDetails(recording);
            const chosen = chosenId === recording.id;
            const inUse = service ? (chosenId ? chosen : recording.isPrimary && service.selection.kind === "none") : false;
            const isPlaying = playing?.id === recording.id;
            return (
              <li key={recording.id} className={cn("group relative px-4 py-3 transition-colors", inUse ? "bg-paper" : "hover:bg-paper/60")}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setPlaying(isPlaying ? null : recording)}
                    aria-label={`${copy.song.play}: ${recording.title}`}
                    aria-pressed={isPlaying}
                    className={cn(
                      "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-colors group-hover:border-gold group-hover:text-ink aria-pressed:border-gold aria-pressed:bg-gold/15",
                      // The whole row is this button's hit area.
                      "after:absolute after:inset-0 after:cursor-pointer after:content-['']",
                    )}
                  >
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 5l12 7-12 7V5z" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">
                      {recording.title}
                      {recording.isPrimary ? <Badge tone="gold">{copy.song.primary}</Badge> : null}
                      {chosen ? <Badge tone="gold">{copy.planner.chosenHere}</Badge> : null}
                      {recording.visibility === "members" ? <Badge>{copy.song.membersOnly}</Badge> : null}
                    </p>
                    {details ? <p className="text-sm text-ink-soft">{details}</p> : null}
                    {recording.description ? <p className="mt-0.5 text-sm text-muted">{recording.description}</p> : null}
                    <SourceAttribution recording={recording} className="mt-1" />
                  </div>
                  {canManage || service ? (
                    <div className="relative z-10">
                    <ActionMenu
                      label={`${copy.manage.edit}: ${recording.title}`}
                      items={[
                        ...(service && service.planRevision !== null && !chosen
                          ? [{ label: copy.planner.useHere, onSelect: () => choose(recording.id), disabled: Boolean(service.blocked) || pending }]
                          : []),
                        ...(service && chosen ? [{ label: copy.planner.usePrimary, onSelect: () => choose(null), disabled: pending }] : []),
                        ...(canManage && !recording.isPrimary && isPlaylistCapable(recording.provider)
                          ? [{ label: copy.manage.setPrimary, onSelect: () => setPrimary(recording.id) }]
                          : []),
                        ...(canManage && recording.isPrimary ? [{ label: copy.manage.clearPrimary, onSelect: () => setPrimary(null) }] : []),
                        ...(canManage ? [{ label: copy.manage.edit, onSelect: () => setEditing({ kind: "recording", recording }) }] : []),
                        ...(canManage ? [{ label: copy.manage.delete, onSelect: () => setDeleting({ kind: "recording", item: recording })}] : []),
                      ]}
                    />
                    </div>
                  ) : null}
                </div>
                {isPlaying ? (
                  <div className="relative z-10 mt-3">
                    <YouTubePlayer mediaId={recording.mediaId} playing loadKey={0} title={recording.title} onEnded={() => setPlaying(null)} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {service?.blocked ? <p className="mt-2 text-xs text-muted">{service.blocked}</p> : null}
      {service && chosenId ? (
        <Button variant="quiet" className="mt-2 px-0" onClick={() => choose(null)} state={stateOf("choose-primary")} disabled={pending}>
          {copy.planner.usePrimary}
        </Button>
      ) : null}

      {links.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-ink">{copy.song.otherMedia}</h4>
          <p className="text-xs text-muted">{copy.song.otherMediaNote}</p>
          <ul className="mt-2 space-y-2">
            {links.map((link) => (
              <li key={link.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <ExternalLink href={link.url} showIcon className="text-ink underline decoration-dotted underline-offset-4 hover:text-gold-dark">
                    {link.title}
                  </ExternalLink>
                  <span className="ml-2 text-xs text-muted">{LINK_SOURCE_LABELS[link.source]}</span>
                  {link.visibility === "members" ? <Badge>{copy.song.membersOnly}</Badge> : null}
                  {link.description ? <p className="text-sm text-muted">{link.description}</p> : null}
                </div>
                {canManage ? (
                  <ActionMenu
                    label={`${copy.manage.edit}: ${link.title}`}
                    items={[
                      { label: copy.manage.edit, onSelect: () => setEditing({ kind: "link", link }) },
                      { label: copy.manage.delete, onSelect: () => setDeleting({ kind: "link", item: link })},
                    ]}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing({ kind: "recording" })}>
            {copy.manage.addRecording}
          </Button>
          <Button variant="quiet" onClick={() => setEditing({ kind: "link" })}>
            {copy.manage.addLink}
          </Button>
        </div>
      ) : null}
      {canManage && recordings.length > 0 ? <p className="mt-2 text-xs text-muted">{copy.manage.primaryHelp}</p> : null}

      {editing?.kind === "recording" ? (
        <RecordingForm songId={songId} songTitle={songTitle} recording={editing.recording} onClose={() => setEditing(null)} onSaved={onChanged} />
      ) : null}
      {editing?.kind === "link" ? (
        <LinkForm songId={songId} songTitle={songTitle} link={editing.link} onClose={() => setEditing(null)} onSaved={onChanged} />
      ) : null}
      {deleting ? (
        <Modal
          title={copy.manage.delete}
          subtitle={deleting.item.title}
          closeLabel={copy.manage.cancel}
          onClose={() => setDeleting(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setDeleting(null)}>
                {copy.manage.cancel}
              </Button>
              <Button
                state={stateOf("delete")}
                disabled={pending}
                onClick={() =>
                  void run(() => (deleting.kind === "recording" ? deleteRecording({ id: deleting.item.id }) : removeMediaLink({ id: deleting.item.id })), {
                    key: "delete",
                    toast: true,
                    onOk: () => {
                      if (deleting.kind === "recording" && playing?.id === deleting.item.id) setPlaying(null);
                      setDeleting(null);
                      onChanged({ kind: deleting.kind === "recording" ? "recording-deleted" : "link-deleted", id: deleting.item.id });
                    },
                  })
                }
              >
                {copy.manage.delete}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-ink-soft">{deleting.kind === "recording" ? copy.manage.deleteRecordingConfirm : copy.manage.deleteLinkConfirm}</p>
        </Modal>
      ) : null}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "gold" }) {
  return (
    <span
      className={cn(
        "ml-2 inline-flex translate-y-[-1px] rounded-full border px-2 py-px align-middle text-[0.7rem] font-semibold uppercase tracking-wide",
        tone === "gold" ? "border-gold/60 text-gold-dark" : "border-line text-muted",
      )}
    >
      {children}
    </span>
  );
}
