"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { deleteSpecialService, publishServices, saveService, saveServiceLeaders, setServiceStatus } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Notice } from "@/components/account/Notices";
import { Pill } from "@/components/admin/StatusPill";
import { usePlannerDraft } from "@/components/conductor/planner-draft";
import { useConductorScreen } from "@/components/conductor/screen-context";
import { SongLink, songRef } from "@/components/song-list/SongLink";
import { ActionBar } from "@/components/ui/ActionBar";
import { ReportLink } from "@/components/support/ReportLink";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { useAction } from "@/components/ui/use-action";
import { useFlip } from "@/components/ui/use-flip";
import { useUnsavedGuard } from "@/components/ui/use-unsaved-guard";
import { feedbackContent } from "@/content/feedback";
import { servicePlannerContent } from "@/content/service-planner";
import { supportContent } from "@/content/support";
import { isAiLocked, lockedPlaces, locksAfterGeneration, toggleAiLock, type LockChoices } from "@/lib/ai/service-planner/locks";
import type { PlanAiRequest } from "@/lib/ai/service-planner/protocol";
import type { ActionResult } from "@/lib/auth/session";
import { plural } from "@/lib/plural";
import { churchTimeOf, progressLabel, serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import {
  candidateSheetMusicCheck,
  serviceSignals,
  type CandidateSong,
  type PlanningSignal,
  type ServiceAvailability,
} from "@/lib/service-planner/intelligence";
import { pruneOverrides, sameLeadership, withDefault, withoutOverrides, withPlaceChoice } from "@/lib/leadership/model";
import { insertPlaces, isInsert, planSong, type PlannerService, type PlanSlots } from "@/lib/service-planner/model";
import { addPlace, clearSong, movePlace, placeIdsFor, removePlace, setSong, type Places } from "@/lib/service-planner/places";
import type { PlanEvent } from "@/lib/service-planner/store";
import { formatAgo, formatChurchTime, formatShortDate } from "@/lib/service-time";
import type { SongReference } from "@/lib/song-identity";
import type { DatedService } from "@/types/song-list";

import { recordingsContent } from "@/content/recordings";
import type { WorkspaceRecordings } from "@/lib/recordings/planner";
import { placeRecording, recordingSignals, type RecordingSignal } from "@/lib/recordings/readiness";
import { applyRecordingChange, type RecordingChange } from "@/lib/recordings/changes";
import { catalogOf } from "@/lib/recordings/resolve";

import { AiGenerate, SparkleIcon, type GeneratedPlan } from "./AiGenerate";
import { DefaultLeaderBar, LeadersPanel, PlaceLeader, type LeaderDraft, type LeaderPerson } from "./LeaderControls";
import { requestPlanAi } from "./ai-request";
import { Disclosure, Panel } from "./Panel";
import { PlaylistPreview } from "./PlaylistPreview";
import { ReviewPublish } from "./ReviewPublish";
import { SongPanel } from "./SongPanel";
import { SongPicker, type ChosenSong } from "./SongPicker";

const copy = servicePlannerContent;
const ws = copy.workspace;
const ai = copy.ai;
const words = feedbackContent;

/** A button that reads as a link, inside a notice. */
const NOTICE_LINK = "font-medium text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark";

/** The keys offered as you type; any other key ("C Dorian") can still be typed. */
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_OPTIONS = [...KEYS, ...KEYS.map((key) => `${key}m`)];

export interface WorkspaceProps {
  now: number;
  service: Omit<PlannerService, "plan">;
  revision: number | null;
  /** Stored, and never published - can be deleted outright (special services only). */
  deletable: boolean;
  locked: boolean;
  /** Holds use_ai: Generate with AI, Suggest with AI and the songs' AI locks are shown. */
  canUseAi: boolean;
  candidates: CandidateSong[];
  recentPast: DatedService[];
  planned: Array<{ startsAt: string; songs: SongReference[] }>;
  sheetMusicChecked: boolean;
  availability: ServiceAvailability | null;
  events: Array<PlanEvent & { actorName: string | null }>;
  /**
   * The song leaders (src/lib/leadership): who leads by default and each
   * song, and everyone who could. Null when they could not be read - the
   * songs can still be planned, and the leaders are left as they are.
   */
  leaders: { draft: LeaderDraft; revision: number; people: LeaderPerson[] } | null;
  /** The service's place IDs had to be given afresh: its leaders need checking (StoredPlan.placesReset). */
  placesReset: boolean;
  /**
   * Every recording and link (the song pages' catalog), and the recordings
   * chosen for this service's places. Null when they could not be read - the
   * songs can still be planned.
   */
  recordings: WorkspaceRecordings | null;
  /** Holds manage_songs: may add, change and delete recordings, and choose a song's primary. */
  canManageSongs: boolean;
}

const STATUS_DOT: Record<"selected" | "primary" | "unset" | "none" | "issue", string> = {
  selected: "bg-gold",
  primary: "bg-ink-soft",
  unset: "border border-gold",
  none: "border border-staff",
  issue: "bg-gold-dark",
};

const NO_LEADERS: LeaderDraft = { defaultUserId: null, overrides: {} };

/** A service's leaders as they would be saved: only overrides for places that exist. */
function leadersFor(draft: LeaderDraft, places: readonly string[]): LeaderDraft {
  return { defaultUserId: draft.defaultUserId, overrides: pruneOverrides(draft.overrides, places).overrides };
}

/**
 * The planning workspace for one service: its songs, in order, with their
 * keys and who leads each - the page is mostly this list. Changes stay here
 * until saved; the checks beside it follow every change as it is made.
 */
export function Workspace(props: WorkspaceProps) {
  const { service, locked, candidates, now } = props;
  const router = useRouter();
  // The songs and each place's ID, changed together (src/lib/service-planner/places.ts).
  const [state, setState] = useState<Places>({ slots: service.slots, places: service.places });
  const { slots, places } = state;
  const [leaders, setLeaders] = useState<LeaderDraft>(props.leaders?.draft ?? NO_LEADERS);
  const [label, setLabel] = useState(service.label ?? "");
  const [time, setTime] = useState(churchTimeOf(service.startsAt));
  const [picker, setPicker] = useState<{ index: number; replacing: string | null } | null>(null);
  const { pending, result, clear, run: runAction, stateOf } = useAction();
  const [conflict, setConflict] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  useFlip(listRef, places);

  // AI: which songs it must leave alone, what was last asked of it, and what it last did.
  // None of it is part of the plan: it is never saved, and does not make the service "unsaved".
  const [locks, setLocks] = useState<LockChoices>({});
  const [generating, setGenerating] = useState(false);
  const [instruction, setInstruction] = useState("");
  /** Improve the plan as it stands, or plan the unlocked places afresh: kept, like the instruction, for the next time. */
  const [strategy, setStrategy] = useState<PlanAiRequest["strategy"]>("improve");
  const [aiResult, setAiResult] = useState<{
    summary: string;
    changed: number;
    lyricsUsed: boolean;
    /** The songs and locks as they were, for Undo. */
    before: { slots: PlanSlots; locks: LockChoices };
  } | null>(null);

  /**
   * A change was saved (or the service's status changed) and the page's fresh
   * copy has not arrived yet. It holds until that copy arrives (below) - never
   * on a timer, so a slow refresh never makes the saved work look unsaved
   * again. Editing goes on meanwhile; only saving again waits for it, so the
   * next save is made against the stored revision.
   */
  const [settled, setSettled] = useState(false);
  /** What the last successful save sent: what "unsaved" is measured against until the fresh copy arrives. */
  const [savedAs, setSavedAs] = useState<{ songs: string; leaders: LeaderDraft } | null>(null);

  const status = service.status;
  const editable = !locked && status !== "cancelled";
  const leadersEditable = editable && props.leaders !== null;
  const initialSongs = useMemo(
    () => JSON.stringify([service.slots, service.places, service.label ?? "", churchTimeOf(service.startsAt)]),
    [service],
  );
  const initialLeaders = useMemo(() => leadersFor(props.leaders?.draft ?? NO_LEADERS, service.places), [props.leaders, service.places]);
  const currentSongs = JSON.stringify([slots, places, label, time]);
  const leadersNow = leadersFor(leaders, places);
  const songsDirty = currentSongs !== (savedAs?.songs ?? initialSongs);
  const leadersDirty = props.leaders !== null && !sameLeadership(leadersNow, savedAs?.leaders ?? initialLeaders);
  const dirty = songsDirty || leadersDirty;

  // The page's fresh copy has arrived. When the stored service itself changed (a save, a status change, or
  // someone else's work) the editor takes the stored copy - unless this was our own save and something was
  // edited since, which stays, now measured against the stored copy.
  const stored = `${props.revision ?? 0}-${status}-${props.leaders?.revision ?? "x"}`;
  const [shown, setShown] = useState({ service, stored });
  if (shown.service !== service || shown.stored !== stored) {
    const editedSince = savedAs !== null && (currentSongs !== savedAs.songs || !sameLeadership(leadersNow, savedAs.leaders));
    if (shown.stored !== stored && !editedSince) {
      setState({ slots: service.slots, places: service.places });
      setLeaders(props.leaders?.draft ?? NO_LEADERS);
      setLabel(service.label ?? "");
      setTime(churchTimeOf(service.startsAt));
      setConflict(false);
    }
    setShown({ service, stored });
    setSettled(false);
    setSavedAs(null);
  }
  const filled = slots.filter(Boolean).length;
  // Places taken away that had a leader of their own: said before saving, never a surprise.
  const clearing = Object.keys(initialLeaders.overrides).filter((placeId) => !places.includes(placeId)).length;

  const candidateMap = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const signals = useMemo(
    () =>
      serviceSignals({
        service: { startsAt: service.startsAt, date: service.date, slots },
        past: props.recentPast,
        planned: props.planned,
        identities: candidates,
        sheetMusic: props.sheetMusicChecked ? candidateSheetMusicCheck(candidateMap) : null,
      }),
    [slots, service.startsAt, service.date, props.recentPast, props.planned, props.sheetMusicChecked, candidateMap, candidates],
  );

  // --- the selected song, and its recordings ---------------------------------

  /** The place whose song's recordings are open in the dialog (by its stable ID, so it follows the song when moved). */
  const [selected, setSelected] = useState<string | null>(null);
  /** The place a check pointed to: highlighted in the list, nothing opened. */
  const [focused, setFocused] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const selectedIndex = selected ? places.indexOf(selected) : -1;
  const selectedSong = selectedIndex >= 0 ? slots[selectedIndex] : null;
  // A recording change shows the moment it has worked; the page's fresh data replaces it when it arrives.
  const [recordingData, setRecordingData] = useState(props.recordings);
  const [recordingsFromServer, setRecordingsFromServer] = useState(props.recordings);
  if (props.recordings !== recordingsFromServer) {
    setRecordingsFromServer(props.recordings);
    setRecordingData(props.recordings);
  }
  const applyRecording = (change: RecordingChange) =>
    setRecordingData((data) => (data ? applyRecordingChange(data, change, { date: service.date, slot: service.slot }) : data));
  const selections = useMemo(() => recordingData?.selections ?? [], [recordingData]);
  const catalog = useMemo(() => catalogOf(recordingData?.recordings ?? []), [recordingData]);
  const recordingChecks = useMemo(
    () => (recordingData ? recordingSignals(slots, places, selections, catalog) : []),
    [recordingData, slots, places, selections, catalog],
  );
  /** A recording is chosen for one place of the service as it is stored: never while songs are unsaved. */
  const chooseBlocked = props.revision === null ? recordingsContent.manage.errors.unsaved : songsDirty ? recordingsContent.manage.errors.unsaved : null;
  const focusPlace = (placeId: string) => {
    setFocused(placeId);
    // Brought into view, and the reader told where they are.
    requestAnimationFrame(() => document.getElementById(`place-${placeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const reviewWarnings = notableWarnings(signals, recordingChecks, Date.parse(service.startsAt));
  /** The place a check is about: its own, or the first song of that title. */
  const placeOfTitle = (title: string) => {
    const index = slots.findIndex((song) => song?.title === title);
    return index >= 0 ? places[index] : null;
  };

  // --- editing -------------------------------------------------------------

  const update = (next: Places) => {
    clear();
    setState(next);
    // Edited by hand since: undoing AI's plan would now throw that edit away.
    setAiResult(null);
  };
  const move = (index: number, by: -1 | 1) => update(movePlace(state, index, by));
  const choose = (index: number, song: ChosenSong) => {
    // Whether the song is an insert is the song's own doing (no hymnal number), wherever it is put:
    // a hymn chosen for the place the insert stood in is an ordinary song there. The place - and
    // whoever leads it - stays.
    update(setSong(state, index, planSong(song)));
    setPicker(null);
  };
  const setKey = (index: number, key: string) => {
    const song = slots[index];
    if (!song) return;
    update(setSong(state, index, { ...song, key: key.trim() === "" ? null : key }));
  };
  const editLeaders = (next: LeaderDraft) => {
    clear();
    setLeaders(next);
  };

  // --- AI ------------------------------------------------------------------

  const aiAvailable = props.canUseAi && editable;
  const lockedNow = useMemo(() => lockedPlaces(slots, locks), [slots, locks]);

  /** AI's plan goes into the editor like any other edit: unsaved until it is saved. Each place keeps its leader. */
  const applyGenerated = (plan: GeneratedPlan) => {
    clear();
    setAiResult({ summary: plan.summary, changed: plan.changed.length, lyricsUsed: plan.lyricsUsed, before: { slots, locks } });
    setState({ slots: plan.slots, places: placeIdsFor(plan.slots.length, places) });
    setLocks(locksAfterGeneration(locks, plan.slots, plan.changed));
    setGenerating(false);
  };
  const undoGenerated = () => {
    if (!aiResult) return;
    clear();
    setState({ slots: aiResult.before.slots, places: placeIdsFor(aiResult.before.slots.length, places) });
    setLocks(aiResult.before.locks);
    setAiResult(null);
  };

  // --- saving --------------------------------------------------------------

  /**
   * Each button has its own key, so only the one pressed shows working and
   * done. The page gives this editor a fresh copy once the stored service
   * changes (its `key`), which would take a message here with it - so "Saved"
   * is said in a toast, which stays.
   */
  function run(key: string, action: () => Promise<ActionResult<unknown>>, onSaved?: () => void) {
    return runAction(
      async () => {
        const outcome = await action();
        if (!outcome.ok && outcome.error === ws.conflict) setConflict(true);
        return outcome;
      },
      {
        key,
        toast: true,
        // Each of these actions revalidates this page, so its fresh copy comes back with the answer: a
        // second refresh would only render the whole page again.
        refresh: false,
        onOk: () => {
          setSettled(true);
          onSaved?.();
        },
      },
    );
  }

  const leadership = (revision: number) => ({ revision, defaultUserId: leadersNow.defaultUserId, overrides: leadersNow.overrides });

  /**
   * Songs (and leaders, when they changed too) are saved together, in one
   * go. Leaders alone are saved on their own: the song list is never
   * republished, withdrawn or announced for them.
   */
  const save = (publish: boolean) => {
    // What is being saved, as it is at the press: the measure of "unsaved" from the moment it is.
    const sent = { songs: currentSongs, leaders: leadersNow };
    const leaderRevision = props.leaders?.revision ?? 0;
    return run(
      publish ? "publish" : "save",
      () =>
        // Nothing changed: publishing alone, so the history records no empty edit.
        publish && !dirty
          ? publishServices({ anchors: [service.anchor] })
          : !publish && !songsDirty
            ? saveServiceLeaders({ anchor: service.anchor, planRevision: props.revision ?? 0, leadership: leadership(leaderRevision) })
            : saveService({
                anchor: service.anchor,
                revision: props.revision,
                slots,
                places,
                leadership: leadersDirty ? leadership(leaderRevision) : undefined,
                label: label.trim() === "" ? null : label.trim(),
                time,
                publish,
              }),
      () => {
        setSavedAs(sent);
        // AI's plan is saved now: undoing it would be an edit of its own.
        setAiResult(null);
      },
    );
  };

  const title = serviceTitle({ slot: service.slot, startsAt: service.startsAt, label: label.trim() || service.label });
  // While saving nothing is edited. Once saved, editing goes on at once (an edit made before the fresh
  // copy arrives is kept, above); only saving again waits for that copy and its revision.
  const locking = pending;
  const saveLocked = pending || settled;
  // Leaving with changes not saved asks first, however the page is left.
  const guard = useUnsavedGuard(dirty);
  // Conductor, asked over this page, is told the songs as they stand here - saved or not - and the rest of
  // what the editor shows.
  usePlannerDraft(service.anchor, slots, dirty);
  useConductorScreen("details", editable ? { name: label, time, unsaved: dirty } : null);
  useConductorScreen("aiProposal", aiResult ? { summary: aiResult.summary, changed: aiResult.changed } : null);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <RehearsalMark>{copy.title}</RehearsalMark>
          <h1 className="text-balance font-display text-4xl text-ink sm:text-5xl">{title}</h1>
          <p className="mt-3 text-lg text-muted">
            {serviceFullDate(service.startsAt)} · {formatChurchTime(service.startsAt)}
          </p>
        </div>
        <Pill tone={status === "published" ? "strong" : status === "draft" ? "warning" : "muted"}>
          {copy.status[status]}
        </Pill>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {locked ? <Notice className="mb-6">{ws.locked}</Notice> : null}
          {status === "cancelled" ? <Notice className="mb-6">{ws.cancelledNotice}</Notice> : null}
          {conflict ? (
            <Notice tone="warning" className="mb-6">
              {ws.conflict}{" "}
              <button type="button" className={NOTICE_LINK} onClick={() => router.refresh()}>
                {ws.reload}
              </button>
            </Notice>
          ) : null}
          {aiResult ? (
            <Notice tone="success" title={aiResult.changed === 0 ? ai.noChange : plural(ai.applied, aiResult.changed)} className="mb-6">
              {aiResult.summary ? <p>{aiResult.summary}</p> : null}
              {aiResult.lyricsUsed ? null : <p className="mt-1">{ai.noLyrics}</p>}
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {aiResult.changed > 0 ? (
                  <button type="button" className={NOTICE_LINK} onClick={undoGenerated}>
                    {ai.undo}
                  </button>
                ) : null}
                <button type="button" className={NOTICE_LINK} onClick={() => setAiResult(null)}>
                  {ai.dismiss}
                </button>
              </p>
            </Notice>
          ) : null}

          {/* While saving, and until the saved copy arrives, nothing in the list can be changed. */}
          <fieldset disabled={locking} className="contents">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-4 sm:px-6">
              <h2 className="font-display text-xl text-ink">{ws.songs}</h2>
              <span className="flex items-baseline gap-4">
                <span className="text-sm text-muted">{progressLabel(filled, slots.length)}</span>
                {recordingData && filled > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPreviewing(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-ink-soft underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
                  >
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 5l12 7-12 7V5z" />
                    </svg>
                    {recordingsContent.planner.preview}
                  </button>
                ) : null}
              </span>
            </div>
            {props.leaders ? (
              <DefaultLeaderBar
                people={props.leaders.people}
                draft={leaders}
                places={places}
                editable={leadersEditable}
                onDefault={(userId) => editLeaders(withDefault(leaders, userId))}
                onClearOverrides={() => editLeaders(withoutOverrides(leaders))}
              />
            ) : (
              <p role="status" className="border-b border-line px-5 py-3 text-sm text-gold-dark sm:px-6">
                {copy.leaders.loadFailed}
              </p>
            )}

            <ol ref={listRef} className="divide-y divide-line">
              {slots.map((song, index) => {
                // Each place's leader, under its song: the place keeps it wherever the song moves.
                const leaderLine = props.leaders ? (
                  <div className="mt-1 flex min-w-0 pl-[2.875rem]">
                    <PlaceLeader
                      placeId={places[index]}
                      position={index + 1}
                      people={props.leaders.people}
                      draft={leaders}
                      editable={leadersEditable}
                      onChoose={(choice) => editLeaders(withPlaceChoice(leaders, places[index], choice))}
                    />
                  </div>
                ) : null;
                return (
                <li
                  // A place is known by its own ID, so the same song twice is still two rows.
                  key={places[index]}
                  id={`place-${places[index]}`}
                  data-flip={`place-${places[index]}`}
                  aria-current={focused === places[index] || selected === places[index] ? "true" : undefined}
                  // On a phone a song's key and buttons take a second line
                  // under its title, so the title keeps the width; from `sm`
                  // it is all one line.
                  className={cn(
                    "relative grid items-center gap-x-2 gap-y-1 px-3 py-2.5 sm:flex sm:gap-4 sm:px-5",
                    // With AI, a column before the numbers holds each song's lock.
                    aiAvailable ? "grid-cols-[2.25rem_1.5rem_minmax(0,1fr)_auto] sm:pl-3" : "grid-cols-[1.5rem_minmax(0,1fr)_auto]",
                    song && isInsert(song) && "bg-paper/40",
                    (focused === places[index] || selected === places[index]) && "bg-paper ring-1 ring-inset ring-gold/60",
                  )}
                >
                  {song && isInsert(song) ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-gold" /> : null}
                  {/* Before everything else in the row, apart from the buttons that edit: a lock says what AI may do, and changes nothing itself. */}
                  {aiAvailable ? (
                    song ? (
                      <IconButton
                        label={lockedNow[index] ? ai.lock.locked : ai.lock.unlocked}
                        pressed={lockedNow[index]}
                        onClick={() => setLocks((current) => toggleAiLock(song, current))}
                      >
                        <path d="M4 7.5h8v5.5H4z" />
                        <path d={lockedNow[index] ? "M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7.5V5.5a2.5 2.5 0 0 1 4.9-.7"} />
                      </IconButton>
                    ) : (
                      // An empty place has nothing to lock; the numbers still line up.
                      <span aria-hidden="true" className="size-9 shrink-0" />
                    )
                  ) : null}
                  <span className={cn("tnum w-6 shrink-0 text-center text-sm text-muted", aiAvailable && "sm:-ml-2")}>{index + 1}</span>

                  {song ? (
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex items-baseline gap-x-2.5">
                        <span className="tnum w-9 shrink-0 text-right font-display text-base text-gold-dark">
                          {song.number ?? <span aria-hidden="true">·</span>}
                        </span>
                        <span className="min-w-0">
                          <SongLink {...songRef(song)} className="text-[0.98rem] font-medium text-ink" />
                          {isInsert(song) ? (
                            <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gold-dark">
                              {ws.insert}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {leaderLine}
                      {recordingData ? (
                        <div className="mt-0.5 pl-[2.875rem]">
                          <RecordingChip
                            entry={placeRecording(song, places[index], selections, catalog)}
                            title={song.title}
                            open={selected === places[index]}
                            onOpen={() => {
                              setFocused(null);
                              setSelected(places[index]);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : editable ? (
                    <div className="min-w-0 flex-1 py-1">
                    <button
                      type="button"
                      onClick={() => setPicker({ index, replacing: null })}
                      className="group flex min-h-9 w-full min-w-0 items-center gap-x-2.5 text-left text-[0.95rem] text-muted transition-colors hover:text-ink"
                    >
                      {/* In the number column, so "Choose a song" lines up with the titles. */}
                      <span aria-hidden="true" className="flex w-9 shrink-0 justify-end">
                        <span className="grid size-6 place-items-center rounded-full border border-dashed border-staff transition-colors group-hover:border-gold group-hover:text-gold-dark">
                          {/* Drawn, not typed: a "+" character sits where its font puts it, never quite in the middle. */}
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                            <path d="M5 1.5v7M1.5 5h7" />
                          </svg>
                        </span>
                      </span>
                      {ws.chooseSong}
                    </button>
                    {leaderLine}
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1 py-2.5">
                      <span className="text-[0.95rem] italic text-muted">{ws.empty}</span>
                      {leaderLine}
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex items-center gap-2 sm:contents",
                      // Under the title, from where the title starts.
                      // (With the lock's column a phone has no room for that: the key joins its buttons on the right, as one group.)
                      song && (aiAvailable ? "col-span-3 col-start-2 justify-end" : "col-span-2 col-start-2 justify-between pl-[2.875rem]"),
                    )}
                  >
                    {song ? (
                      <>
                        <label htmlFor={`key-${index}`} className="sr-only">
                          {ws.keyFor.replace("{title}", song.title)}
                        </label>
                        <input
                          id={`key-${index}`}
                          list="planner-keys"
                          value={song.key ?? ""}
                          disabled={!editable}
                          placeholder={ws.key}
                          autoComplete="off"
                          onChange={(event) => setKey(index, event.target.value)}
                          className="tnum h-9 w-16 shrink-0 rounded-md border border-line bg-surface px-2 text-center text-sm font-medium text-ink transition-colors placeholder:text-muted not-disabled:hover:border-muted/50 disabled:opacity-70"
                        />
                      </>
                    ) : null}

                    {editable ? (
                      <div className="flex shrink-0 items-center">
                        <IconButton label={ws.moveUp} disabled={index === 0} onClick={() => move(index, -1)}>
                          <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
                        </IconButton>
                        <IconButton label={ws.moveDown} disabled={index === slots.length - 1} onClick={() => move(index, 1)}>
                          <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
                        </IconButton>
                        {song ? (
                          <>
                            <IconButton label={ws.replace} onClick={() => setPicker({ index, replacing: song.title })}>
                              {/* The pencil of the admin editors (PencilIcon, OptionListEditor.tsx). */}
                              <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
                            </IconButton>
                            <IconButton label={ws.remove} onClick={() => update(clearSong(state, index))}>
                              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                            </IconButton>
                          </>
                        ) : (
                          <IconButton label={ws.removePlace} onClick={() => update(removePlace(state, index))}>
                            <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" />
                          </IconButton>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
                );
              })}
            </ol>

            {editable ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-5 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => update(addPlace(state))}
                  disabled={slots.length >= 20}
                  className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-muted transition-colors not-disabled:hover:text-ink disabled:opacity-50"
                >
                  <span aria-hidden="true">+</span> {ws.addPlace}
                </button>
                {aiAvailable ? (
                  <Button type="button" variant="secondary" className="min-h-9 px-4" disabled={locking} onClick={() => setGenerating(true)}>
                    <SparkleIcon className="text-gold-dark" />
                    {ai.generate}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
          </fieldset>
          <datalist id="planner-keys">
            {KEY_OPTIONS.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>

          {editable ? (
            <ActionBar className="mt-6" barClassName="flex flex-wrap items-center gap-x-4 gap-y-3">
                {/* Its own line on a phone, so it is never squeezed behind the buttons. */}
                <div className="min-w-0 basis-full text-sm sm:basis-auto sm:flex-1">
                  {result ? (
                    <ActionMessage result={result} />
                  ) : settled && !dirty ? (
                    <ActionMessage result={{ ok: true, message: ws.saved }} />
                  ) : dirty ? (
                    <span className="inline-flex flex-wrap items-center gap-x-2 text-gold-dark">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                      {ws.unsaved}
                      {clearing > 0 ? <span className="text-ink-soft">{plural(copy.leaders.clearing, clearing)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted">
                      {status === "published" ? ws.publishedState : status === "draft" ? ws.draftState : ws.newState}
                    </span>
                  )}
                </div>
                <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                  {status === "published" ? (
                    <Button
                      type="button"
                      state={stateOf("save")}
                      pendingLabel={words.saving}
                      doneLabel={words.saved}
                      onClick={() => save(false)}
                      disabled={saveLocked || !dirty}
                    >
                      {leadersDirty && !songsDirty ? copy.leaders.saveLeaders : ws.saveChanges}
                    </Button>
                  ) : (
                    <>
                      {/* Stays to say "Saved", though a saved draft has nothing left to save. */}
                      {dirty || stateOf("save") !== "idle" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          state={stateOf("save")}
                          pendingLabel={words.saving}
                          doneLabel={words.saved}
                          onClick={() => save(false)}
                          disabled={saveLocked}
                        >
                          {leadersDirty && !songsDirty ? copy.leaders.saveLeaders : ws.save}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        state={stateOf("publish")}
                        pendingLabel={words.publishing}
                        doneLabel={words.published}
                        // A last look first: the songs, what changes and any warnings (ReviewPublish).
                        onClick={() => setReviewing(true)}
                        disabled={saveLocked}
                      >
                        {ws.review.button}
                      </Button>
                    </>
                  )}
                </div>
            </ActionBar>
          ) : result ? (
            <div className="mt-6">
              <ActionMessage result={result} />
            </div>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Checks
            signals={signals}
            recordingSignals={recordingChecks}
            sheetMusicChecked={props.sheetMusicChecked}
            serviceStartsAt={service.startsAt}
            onFocus={(placeId) => focusPlace(placeId)}
            placeOfTitle={placeOfTitle}
          />
          {props.leaders ? (
            <LeadersPanel people={props.leaders.people} draft={leaders} places={places} date={service.date} reset={props.placesReset} />
          ) : null}
          <Availability availability={props.availability} date={service.date} />

          {editable ? (
            <Panel title={ws.details} lead={ws.detailsLead} collapsible>
              <fieldset disabled={locking} className="min-w-0 space-y-4">
                <Field id="service-label" label={ws.name}>
                  <input
                    id="service-label"
                    value={label}
                    maxLength={80}
                    placeholder={serviceTitle({ slot: service.slot, startsAt: service.startsAt, label: null })}
                    onChange={(event) => setLabel(event.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </Field>
                <Field id="service-time" label={ws.time}>
                  <input
                    id="service-time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                  />
                </Field>
                <p className="text-xs text-muted">{ws.detailsHint}</p>
              </fieldset>
            </Panel>
          ) : null}

          {!locked ? (
            <Panel title={ws.manage}>
              <div className="grid gap-2">
                {status === "published" ? (
                  <Link href={`/song-list#${service.anchor}`} className={buttonClasses("secondary", "md", "w-full")}>
                    {ws.viewOnSongList}
                  </Link>
                ) : null}
                <a
                  href={`/service-planner/export?format=formatted-pdf&services=${service.anchor}&drafts=1`}
                  className={buttonClasses("secondary", "md", "w-full")}
                >
                  {ws.exportPdf}
                </a>
                {status === "published" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    state={stateOf("status")}
                    pendingLabel={words.updating}
                    doneLabel={words.done}
                    disabled={saveLocked}
                    onClick={() => run("status", () => setServiceStatus({ anchor: service.anchor, status: "draft" }))}
                  >
                    {ws.unpublish}
                  </Button>
                ) : null}
                {status === "cancelled" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    state={stateOf("status")}
                    pendingLabel={words.restoring}
                    doneLabel={words.restored}
                    disabled={saveLocked}
                    onClick={() => run("status", () => setServiceStatus({ anchor: service.anchor, status: "draft" }))}
                  >
                    {ws.restore}
                  </Button>
                ) : props.deletable ? (
                  <Button
                    type="button"
                    variant="quiet"
                    className="w-full"
                    state={stateOf("delete")}
                    pendingLabel={words.deleting}
                    doneLabel={words.deleted}
                    disabled={saveLocked}
                    onClick={() =>
                      run("delete", async () => {
                        const outcome = await deleteSpecialService({ anchor: service.anchor });
                        if (!outcome.ok) return outcome;
                        router.push("/service-planner");
                        return { ...outcome, message: words.serviceDeleted };
                      })
                    }
                  >
                    {ws.deleteSpecial}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="quiet"
                    className="w-full"
                    state={stateOf("status")}
                    pendingLabel={words.updating}
                    doneLabel={words.done}
                    disabled={saveLocked}
                    onClick={() => run("status", () => setServiceStatus({ anchor: service.anchor, status: "cancelled" }))}
                  >
                    {ws.cancelService}
                  </Button>
                )}
              </div>
              {status === "published" ? <p className="mt-3 text-xs text-muted">{ws.unpublishHint}</p> : null}
              {/* The Support Center lists this service's places (by their place IDs) to choose from. */}
              <p className="mt-3 text-center">
                <ReportLink entry="problem" refs={{ service: service.anchor }} className="text-sm">
                  {supportContent.report.problem}
                </ReportLink>
              </p>
            </Panel>
          ) : null}

          <History events={props.events} />
        </aside>
      </div>

      {guard.pending ? (
        <Modal
          title={ws.leaveTitle}
          closeLabel={ws.leaveStay}
          onClose={guard.stay}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={guard.stay}>
                {ws.leaveStay}
              </Button>
              <Button type="button" onClick={guard.leave}>
                {ws.leaveConfirm}
              </Button>
            </>
          }
        >
          <p className="text-ink-soft">{ws.leaveWarning}</p>
        </Modal>
      ) : null}

      {/* The chosen song's recordings: a dialog over the list, at any width - plainly what was opened, and for which song. */}
      {selectedSong && selected && recordingData ? (
        <Modal title={selectedSong.title} closeLabel={ws.songPanel.close} onClose={() => setSelected(null)} size="lg" sheet>
          <SongPanel
            bare
            song={selectedSong}
            position={selectedIndex + 1}
            recordings={recordingData.recordings}
            links={recordingData.links}
            canManage={props.canManageSongs}
            service={{
              anchor: service.anchor,
              placeId: selected,
              planRevision: props.revision,
              selection: placeRecording(selectedSong, selected, selections, catalog)?.selection ?? { kind: "none" },
              blocked: editable ? chooseBlocked : ws.locked,
            }}
            onChanged={applyRecording}
          />
        </Modal>
      ) : null}

      {previewing && recordingData ? (
        <PlaylistPreview
          service={{ date: service.date, slot: service.slot, startsAt: service.startsAt, label: label.trim() || service.label }}
          slots={slots}
          places={places}
          recordings={recordingData.recordings}
          selections={selections}
          onClose={() => setPreviewing(false)}
        />
      ) : null}

      {reviewing ? (
        <ReviewPublish
          title={title}
          saved={service.slots}
          slots={slots}
          dirty={dirty}
          warnings={reviewWarnings}
          state={stateOf("publish")}
          onPublish={() => {
            void save(true).then(() => setReviewing(false));
          }}
          onClose={() => setReviewing(false)}
        />
      ) : null}

      {picker ? (
        <SongPicker
          candidates={candidates}
          serviceStartsAt={service.startsAt}
          now={now}
          title={picker.replacing ? copy.picker.replaceTitle.replace("{title}", picker.replacing) : copy.picker.title}
          onChoose={(song) => choose(picker.index, song)}
          onClose={() => setPicker(null)}
          place={{ place: picker.index + 1, replacing: picker.replacing }}
          // The service has its insert, and this place is not it: another is not offered in passing. Typing still finds one.
          hideInsertSuggestions={insertPlaces(slots).some((index) => index !== picker.index)}
          ai={
            aiAvailable
              ? {
                  locked: isAiLocked(slots[picker.index] ?? null, locks),
                  suggest: (signal) =>
                    requestPlanAi(
                      { mode: "replace", anchor: service.anchor, revision: props.revision, slots, locked: lockedNow, target: picker.index },
                      signal,
                    ),
                }
              : undefined
          }
        />
      ) : null}

      {generating ? (
        <AiGenerate
          anchor={service.anchor}
          revision={props.revision}
          slots={slots}
          locked={lockedNow}
          instruction={instruction}
          onInstruction={setInstruction}
          strategy={strategy}
          onStrategy={setStrategy}
          onGenerated={applyGenerated}
          onClose={() => setGenerating(false)}
        />
      ) : null}
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  /** For a button that is on or off (a lock): said to a screen reader, and shown in gold when on. */
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors not-disabled:hover:bg-paper not-disabled:hover:text-ink disabled:opacity-25",
        pressed ? "text-gold-dark" : "text-muted",
      )}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

/** Which checks are worth a second look (gold) rather than simply worth knowing. */
const NOTABLE = new Set<PlanningSignal["kind"]>([
  "duplicate",
  "recently-sung",
  "sheet-music-gap",
  "capo-needed",
  "no-sheet-music",
  "out-of-season",
]);

/** A planning check in words. */
function describeSignal(signal: PlanningSignal, start: number): string {
  const c = copy.checks;
  switch (signal.kind) {
    case "duplicate":
      return c.duplicate.replace("{title}", signal.title);
    case "recently-sung":
      return c.recentlySung.replace("{title}", signal.title).replace("{ago}", formatAgo(Date.parse(signal.at), start));
    case "planned-nearby":
      return c.plannedNearby.replace("{title}", signal.title).replace("{date}", formatShortDate(signal.at));
    case "repeated-pair":
      return c.repeatedPair
        .replace("{a}", signal.titles[0])
        .replace("{b}", signal.titles[1])
        .replace("{date}", formatShortDate(signal.at));
    case "out-of-season":
      return c.outOfSeason.replace("{title}", signal.title);
    case "no-sheet-music-entry":
      return c.noSheetEntry.replace("{title}", signal.title);
    case "sheet-music-gap":
      return signal.everyone
        ? c.sheetGapEveryone.replace("{title}", signal.title)
        : c.sheetGap.replace("{title}", signal.title).replace("{people}", signal.people.join(", "));
    case "capo-needed":
      return c.capoNeeded.replace("{title}", signal.title).replace("{people}", signal.people.join(", "));
    case "no-sheet-music":
      return signal.anyFiles ? c.noSheetMusicForAnyone : c.noSheetMusic;
    case "key-differs":
      return c.keyDiffers.replace("{title}", signal.title).replace("{key}", signal.key).replace("{current}", signal.current);
    case "empty-places":
      return signal.count === 1 ? c.emptyPlace : c.emptyPlaces.replace("{count}", String(signal.count));
  }
}

/** A recording check in words. */
function describeRecordingSignal(signal: RecordingSignal): string {
  const c = copy.checks;
  if (signal.kind === "recording-issue") {
    return (signal.reason === "removed" ? c.recordingRemoved : c.recordingUnavailable).replace("{title}", signal.title);
  }
  if (signal.kind === "no-primary") return c.noPrimary.replace("{titles}", signal.titles.join(", "));
  return signal.all ? c.noRecordingsAll : c.noRecordings.replace("{titles}", signal.titles.join(", "));
}

/** The song a planning check is about, when it is about one. */
function signalTitle(signal: PlanningSignal): string | null {
  return "title" in signal && typeof signal.title === "string" ? signal.title : null;
}

/** The checks worth a second look, in words: for the review before publishing. */
function notableWarnings(signals: PlanningSignal[], recordingSignals: RecordingSignal[], start: number): string[] {
  return [
    ...signals.filter((signal) => NOTABLE.has(signal.kind)).map((signal) => describeSignal(signal, start)),
    ...recordingSignals.filter((signal) => signal.kind === "recording-issue").map(describeRecordingSignal),
  ];
}

interface CheckLine {
  text: string;
  notable: boolean;
  placeId: string | null;
}

/**
 * The service's checks, in words. They inform; nothing here stops a save.
 * A check about one song is a button: it opens that song in the list.
 * Recordings: a chosen recording that can't be used is worth a look; songs
 * with no recording are one quiet line - that is normal.
 */
function Checks({
  signals,
  recordingSignals,
  sheetMusicChecked,
  serviceStartsAt,
  onFocus,
  placeOfTitle,
}: {
  signals: PlanningSignal[];
  recordingSignals: RecordingSignal[];
  sheetMusicChecked: boolean;
  serviceStartsAt: string;
  onFocus: (placeId: string) => void;
  placeOfTitle: (title: string) => string | null;
}) {
  const c = copy.checks;
  const start = Date.parse(serviceStartsAt);
  const lines: CheckLine[] = [
    ...recordingSignals
      .filter((signal) => signal.kind === "recording-issue")
      .map((signal) => ({ text: describeRecordingSignal(signal), notable: true, placeId: signal.kind === "recording-issue" ? signal.placeId : null })),
    ...signals.map((signal) => {
      const title = signalTitle(signal);
      return { text: describeSignal(signal, start), notable: NOTABLE.has(signal.kind), placeId: title ? placeOfTitle(title) : null };
    }),
    ...recordingSignals
      .filter((signal) => signal.kind === "no-primary" || signal.kind === "no-recordings")
      .map((signal) => ({
        text: describeRecordingSignal(signal),
        notable: false,
        placeId: "placeIds" in signal && signal.placeIds.length === 1 ? signal.placeIds[0] : null,
      })),
  ];
  // Conductor is told the checks as they read here.
  useConductorScreen("checks", lines.map((line) => line.text));

  return (
    <Panel title={c.title}>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">{c.none}</p>
      ) : (
        <ul className="space-y-2.5 text-sm" aria-live="polite">
          {lines.map((line, index) => {
            const dot = (
              <span aria-hidden="true" className={cn("mt-[0.45rem] size-1.5 shrink-0 rounded-full", line.notable ? "bg-gold" : "bg-staff")} />
            );
            const text = <span className={line.notable ? "text-ink" : "text-ink-soft"}>{line.text}</span>;
            return (
              <li key={index}>
                {line.placeId ? (
                  <button
                    type="button"
                    onClick={() => onFocus(line.placeId!)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] gap-2.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-paper"
                  >
                    {dot}
                    {text}
                  </button>
                ) : (
                  <span className="flex gap-2.5">
                    {dot}
                    {text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!sheetMusicChecked ? <p className="mt-3 text-xs text-muted">{c.unavailableIndex}</p> : null}
    </Panel>
  );
}

/** What a song's row says about its recording; opens the song's panel. */
function RecordingChip({
  entry,
  title,
  open,
  onOpen,
}: {
  entry: ReturnType<typeof placeRecording>;
  title: string;
  open: boolean;
  onOpen: () => void;
}) {
  if (!entry) return null;
  const status = entry.resolved.kind;
  const label = recordingsContent.status[status];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${label}. ${copy.workspace.songPanel.open.replace("{title}", title)}`}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-paper",
        status === "issue" ? "text-gold-dark" : status === "none" || status === "unset" ? "text-muted" : "text-ink-soft",
        open && "bg-paper text-ink",
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", STATUS_DOT[status])} />
      {label}
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </button>
  );
}

function Availability({ availability, date }: { availability: ServiceAvailability | null; date: string }) {
  const a = copy.availability;
  return (
    <Panel
      title={a.title}
      aside={
        <Link
          href={`/availability?month=${date.slice(0, 7)}`}
          className="group inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          {a.open}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      }
    >
      {!availability ? (
        <p className="text-sm text-muted">{a.unavailable}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <Disclosure summary={a.expected.replace("{count}", String(availability.expected.length))}>
            <p className="text-muted">{availability.expected.map((person) => person.name).join(", ") || a.nobody}</p>
          </Disclosure>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{a.away}</p>
            {availability.away.length === 0 ? (
              <p className="mt-1 text-muted">{a.noneAway}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {availability.away.map((person) => (
                  <li key={person.id} className="text-ink">
                    {person.name}
                    {person.note ? <span className="text-muted"> - {person.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {availability.extra.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{a.extra}</p>
              <ul className="mt-1 space-y-1">
                {availability.extra.map((person) => (
                  <li key={person.id} className="text-ink">
                    {person.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function History({ events }: { events: Array<PlanEvent & { actorName: string | null }> }) {
  const h = copy.history;
  if (events.length === 0) return null;
  return (
    <Panel title={h.title} collapsible>
      <ol className="space-y-3 text-sm">
        {events.map((event, index) => (
          <li key={index}>
            <p className="text-ink">{(h as Record<string, string>)[event.type] ?? event.type}</p>
            <p className="text-xs text-muted">
              {h.by.replace("{name}", event.actorName ?? h.someone)} · {formatShortDate(event.at)}
            </p>
            {event.changes.length > 0 ? (
              <p className="mt-0.5 text-xs text-ink-soft">{event.changes.map(describeChange).join(" · ")}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function describeChange(change: PlanEvent["changes"][number]): string {
  switch (change.type) {
    case "added":
      return `+ ${change.title}`;
    case "removed":
      return `− ${change.title}`;
    case "moved":
      return `${change.title} ${change.from} → ${change.to}`;
    case "key":
      return `${change.title}: ${change.from ?? "–"} → ${change.to ?? "–"}`;
  }
}
