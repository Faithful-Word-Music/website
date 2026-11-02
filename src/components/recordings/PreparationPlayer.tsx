"use client";

import Link from "next/link";
import { useCallback, useMemo, useReducer, useState } from "react";

import { SongLink, songRef } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { recordingsContent } from "@/content/recordings";
import { INITIAL_PLAYBACK, playback, type PlaybackEvent, type PlaybackState } from "@/lib/recordings/playback";
import type { PlaylistItem } from "@/lib/recordings/playlist";
import type { Recording } from "@/lib/recordings/model";
import { catalogOf, playableRecording, resolveRecording, type Resolved } from "@/lib/recordings/resolve";
import type { WakeLockStatus } from "@/lib/recordings/wake-lock";

import { recordingDetails, RecordingDisclaimer, RecordingReminder, SourceAttribution } from "./RecordingNotes";
import { useKeepAwake } from "./use-keep-awake";
import { useViewerRecordings } from "./use-viewer-recordings";
import { YouTubePlayer } from "./YouTubePlayer";

const copy = recordingsContent.player;

export interface PlaylistSection {
  id: string;
  title: string;
  subtitle?: string;
  /** This service's own playlist, when the page lists several. */
  href?: string;
  items: PlaylistItem[];
}

interface Machine {
  state: PlaybackState;
  /** Bumped whenever the player must load its video afresh. */
  loadKey: number;
}

function reducer(playable: readonly boolean[]) {
  return (machine: Machine, event: PlaybackEvent): Machine => {
    const state = playback(machine.state, event, playable);
    const reload = state.status === "loading" && (machine.state.status !== "loading" || state.current !== machine.state.current);
    return state === machine.state ? machine : { state, loadKey: reload ? machine.loadKey + 1 : machine.loadKey };
  };
}

/**
 * A Preparation Playlist: the songs in service order, with a player that can
 * play them all one after another. A song with no recording keeps its place
 * in the list and is skipped. Built on YouTube's official player; the
 * playback rules are the pure state machine in src/lib/recordings/playback.ts.
 *
 * `recordings` is what the page was built with (public ones only); a
 * signed-in member's own fetch adds the members-only ones. A planner's draft
 * preview passes `draft` and every recording, and fetches nothing.
 */
export function PreparationPlayer({
  sections,
  recordings: initialRecordings,
  draft = false,
  stacked = false,
  className,
}: {
  sections: PlaylistSection[];
  recordings: Recording[];
  draft?: boolean;
  /** One column, the player above the list, and no bar fixed to the screen (inside a dialog). */
  stacked?: boolean;
  className?: string;
}) {
  const fetched = useViewerRecordings({ recordings: initialRecordings, links: [] });
  const recordings = draft ? initialRecordings : fetched.recordings;
  const catalog = useMemo(() => catalogOf(recordings), [recordings]);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const resolved = useMemo(
    () => items.map((item) => resolveRecording(item.recordingSongId, item.selection, catalog)),
    [items, catalog],
  );
  const playable = useMemo(() => resolved.map((entry) => playableRecording(entry) !== null), [resolved]);
  const reduce = useMemo(() => reducer(playable), [playable]);
  const [{ state, loadKey }, send] = useReducer(reduce, { state: INITIAL_PLAYBACK, loadKey: 0 });
  const [playerHeld, setPlayerHeld] = useState(false);

  const current = state.current !== null ? items[state.current] : null;
  const currentRecording = state.current !== null ? playableRecording(resolved[state.current]) : null;
  const wantsPlaying = state.status === "loading" || state.status === "playing";
  const active = state.current !== null && state.status !== "finished";
  // Kept awake while it is really playing (and between one song and the next), never while paused or done.
  const keepAwake = useKeepAwake(wantsPlaying);
  const anyPlayable = playable.some(Boolean);
  const playableCount = playable.filter(Boolean).length;
  const position = state.current !== null ? playable.slice(0, state.current + 1).filter(Boolean).length : 0;

  const act = useCallback((event: PlaybackEvent) => {
    setPlayerHeld(true);
    send(event);
  }, []);

  const statusLine =
    state.status === "blocked"
      ? copy.blocked
      : state.status === "finished"
        ? copy.finished
        : state.status === "loading"
          ? copy.loading
          : !current
            ? anyPlayable
              ? copy.nothingPlaying
              : copy.nothingPlayable
            : null;

  const controls = (compact: boolean) => (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-2")}>
      <IconButton label={copy.previous} onClick={() => act({ type: "PREVIOUS" })} disabled={state.current === null} compact={compact}>
        <path d="M6 5v14M19 5L9 12l10 7V5z" />
      </IconButton>
      {wantsPlaying ? (
        <IconButton label={copy.pause} onClick={() => act({ type: "PAUSED" })} primary compact={compact}>
          <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
        </IconButton>
      ) : (
        <IconButton
          label={state.current === null || state.status === "finished" ? copy.playAll : copy.resume}
          onClick={() => act(state.current === null || state.status === "finished" ? { type: "PLAY_ALL" } : { type: "RESUME" })}
          disabled={!anyPlayable}
          primary
          compact={compact}
        >
          <path d="M7 5l12 7-12 7V5z" />
        </IconButton>
      )}
      <IconButton label={copy.next} onClick={() => act({ type: "NEXT" })} disabled={!anyPlayable} compact={compact}>
        <path d="M18 5v14M5 5l10 7-10 7V5z" />
      </IconButton>
    </div>
  );

  return (
    <div className={cn("grid gap-6", !stacked && "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start", className)}>
      <Card className={cn("p-4 sm:p-5", !stacked && "lg:sticky lg:top-24")}>
        {draft ? (
          <p className="mb-3 inline-flex rounded-full border border-gold/60 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gold-dark">
            {recordingsContent.planner.previewTitle}
          </p>
        ) : null}
        {/* Mounted once someone presses play, and kept: unmounting would stop the sound. */}
        {playerHeld ? (
          <YouTubePlayer
            mediaId={currentRecording?.mediaId ?? null}
            playing={wantsPlaying}
            loadKey={loadKey}
            title={currentRecording?.title ?? copy.nothingPlaying}
            onStarted={() => send({ type: "STARTED" })}
            onPaused={() => send({ type: "PAUSED" })}
            onEnded={() => send({ type: "ENDED" })}
            onError={() => send({ type: "ERROR" })}
            onBlocked={() => send({ type: "BLOCKED" })}
          />
        ) : (
          <button
            type="button"
            onClick={() => act({ type: "PLAY_ALL" })}
            disabled={!anyPlayable}
            className="group flex aspect-video w-full items-center justify-center rounded-lg bg-ink/90 text-paper transition-colors enabled:hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex flex-col items-center gap-2">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-paper/15 transition-transform group-enabled:group-hover:scale-105">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
              </span>
              <span className="text-sm font-medium">{anyPlayable ? copy.playAll : copy.nothingPlayable}</span>
            </span>
          </button>
        )}

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0" aria-live="polite">
            {current && currentRecording ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">
                  {copy.nowPlaying} · {copy.of.replace("{current}", String(position)).replace("{total}", String(playableCount))}
                </p>
                <p className="mt-1 truncate font-display text-xl text-ink">{current.title}</p>
                <p className="truncate text-sm text-ink-soft">{currentRecording.title}</p>
                {recordingDetails(currentRecording) ? <p className="text-xs text-muted">{recordingDetails(currentRecording)}</p> : null}
              </>
            ) : null}
            {statusLine ? <p className={cn("text-sm text-muted", current ? "mt-1" : "")}>{statusLine}</p> : null}
          </div>
          {controls(false)}
        </div>
        {currentRecording ? <SourceAttribution recording={currentRecording} className="mt-2" /> : null}
        <RecordingReminder className="mt-1" />
        <KeepAwakeSetting {...keepAwake} className="mt-4 border-t border-line pt-4" />
        <RecordingDisclaimer className="mt-4" />
      </Card>

      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-heading`}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`${section.id}-heading`} className="font-display text-xl text-ink">
                  {section.title}
                </h3>
                {section.subtitle ? <p className="text-sm text-muted">{section.subtitle}</p> : null}
              </div>
              {section.href ? (
                <Link href={section.href} className="shrink-0 text-sm text-ink-soft underline decoration-dotted underline-offset-4 hover:text-ink">
                  {recordingsContent.preparation.listenToService}
                </Link>
              ) : null}
            </div>
            <Card className="mt-3">
              <ol className="divide-y divide-line">
                {section.items.map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <PlaylistRow
                      key={item.key}
                      item={item}
                      resolved={resolved[index]}
                      current={state.current === index}
                      playing={state.current === index && wantsPlaying}
                      failed={state.failed.includes(index)}
                      onPlay={() => act({ type: "SELECT", index })}
                    />
                  );
                })}
              </ol>
            </Card>
          </section>
        ))}
      </div>

      {/* On a phone the player scrolls away with the list: the controls stay at hand. */}
      {active && current && !stacked ? (
        <div className="fixed bottom-0 left-0 right-(--conductor-inset) z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{current.title}</p>
              <p className="truncate text-xs text-muted">{statusLine ?? currentRecording?.title}</p>
            </div>
            {controls(true)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlaylistRow({
  item,
  resolved,
  current,
  playing,
  failed,
  onPlay,
}: {
  item: PlaylistItem;
  resolved: Resolved;
  current: boolean;
  playing: boolean;
  failed: boolean;
  onPlay: () => void;
}) {
  const recording = playableRecording(resolved);
  const note = failed
    ? copy.failed
    : recording
      ? [recording.title, recordingDetails(recording)].filter(Boolean).join(" · ")
      : resolved.kind === "issue"
        ? copy.unavailable
        : copy.noRecording;
  return (
    <li
      aria-current={current ? "true" : undefined}
      className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", current && "bg-paper", !recording && "text-muted")}
    >
      <span className="tnum w-6 shrink-0 text-right text-sm text-muted">{item.position}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">
          <SongLink {...songRef(item)} className={cn(!recording && "text-ink-soft")} />
          {item.number ? <span className="tnum ml-2 text-xs text-muted">#{item.number}</span> : null}
          {item.musicKey ? <span className="tnum ml-2 text-xs text-gold-dark">{item.musicKey}</span> : null}
        </p>
        <p className={cn("truncate text-xs", failed || resolved.kind === "issue" ? "text-gold-dark" : "text-muted")}>{note}</p>
      </div>
      {recording && !failed ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={`${playing ? recordingsContent.song.playing : recordingsContent.song.play}: ${item.title}`}
          aria-pressed={playing}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
            current ? "border-gold bg-gold/15 text-ink" : "border-line text-ink-soft hover:border-gold hover:text-ink",
          )}
        >
          {playing ? <Equalizer /> : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
          )}
        </button>
      ) : (
        <span className="w-10 shrink-0" aria-hidden="true" />
      )}
    </li>
  );
}

function Equalizer() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="1" y="4" width="3" height="9" rx="1" className="motion-safe:animate-pulse" />
      <rect x="5.5" y="1" width="3" height="12" rx="1" />
      <rect x="10" y="6" width="3" height="7" rx="1" className="motion-safe:animate-pulse" />
    </svg>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  primary,
  compact,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        compact ? "h-10 w-10" : "h-11 w-11",
        primary ? "bg-ink text-paper enabled:hover:bg-ink-soft" : "border border-line text-ink enabled:hover:border-gold",
      )}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill={primary ? "currentColor" : "none"} stroke="currentColor" strokeWidth={primary ? 0 : 2} strokeLinejoin="round" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

/**
 * The Keep Screen Awake switch, and - only when there is something worth
 * saying - one quiet line about it. It keeps the screen on while the page is
 * open and playing; it never makes anything play in the background.
 */
function KeepAwakeSetting({
  enabled,
  setEnabled,
  status,
  className,
}: {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  status: WakeLockStatus;
  className?: string;
}) {
  const words = copy.keepAwake;
  const note =
    status === "unsupported"
      ? words.unsupported
      : !enabled
        ? null
        : status === "active"
          ? words.active
          : status === "refused"
            ? words.refused
            : status === "waiting"
              ? words.waiting
              : null;
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="keep-awake-label" className="text-sm font-medium text-ink">
            {words.label}
          </p>
          <p id="keep-awake-description" className="mt-0.5 text-xs text-muted">
            {words.description}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="keep-awake-label"
          aria-describedby="keep-awake-description"
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
            enabled ? "border-ink bg-ink" : "border-line bg-paper hover:border-gold",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("block h-5 w-5 rounded-full transition-transform", enabled ? "translate-x-[1.375rem] bg-paper" : "translate-x-0.5 bg-muted")}
          />
        </button>
      </div>
      {note ? (
        <p role="status" className="mt-2 text-xs text-ink-soft">
          {note}
        </p>
      ) : null}
    </div>
  );
}
