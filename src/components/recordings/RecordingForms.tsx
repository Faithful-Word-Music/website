"use client";

import { useId, useState } from "react";

import { ActionMessage, ChoiceChips, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { recordingsContent } from "@/content/recordings";
import { addMediaLink, addRecording, editMediaLink, lookUpRecording, updateRecording } from "@/app/recordings/actions";
import type { RecordingChange } from "@/lib/recordings/changes";
import type { MediaLink, Recording, RecordingVisibility } from "@/lib/recordings/model";

const copy = recordingsContent.manage;
const fields = copy.fields;

const VISIBILITY_OPTIONS = [
  { value: "public" as const, label: fields.public },
  { value: "members" as const, label: fields.members },
];

function VisibilityField({ name, value, onChange }: { name: string; value: RecordingVisibility; onChange: (value: RecordingVisibility) => void }) {
  return (
    <div>
      <ChoiceChips name={name} legend={fields.visibility} options={VISIBILITY_OPTIONS} selected={[value]} required onChange={(next) => onChange(next[0] ?? value)} />
      {value === "members" ? <p className="mt-1.5 text-xs text-muted">{copy.visibilityNote}</p> : null}
    </div>
  );
}

/**
 * Adding or changing a playable recording. Adding starts from an address:
 * "Look up" asks YouTube (on the server) for the title and channel, and
 * refuses a video that cannot be played here, before anything is saved.
 */
export function RecordingForm({
  songId,
  songTitle,
  recording,
  onClose,
  onSaved,
}: {
  songId: string;
  songTitle: string;
  /** Given when editing. */
  recording?: Recording;
  onClose: () => void;
  onSaved: (change: RecordingChange) => void;
}) {
  const id = useId();
  const { run, pending, result, stateOf, clear } = useAction();
  const [url, setUrl] = useState(recording?.sourceUrl ?? "");
  const [found, setFound] = useState(Boolean(recording));
  const [title, setTitle] = useState(recording?.title ?? "");
  const [sourceName, setSourceName] = useState(recording?.sourceName ?? "");
  const [arrangement, setArrangement] = useState(recording?.arrangement ?? "");
  const [musicKey, setMusicKey] = useState(recording?.musicKey ?? "");
  const [description, setDescription] = useState(recording?.description ?? "");
  const [visibility, setVisibility] = useState<RecordingVisibility>(recording?.visibility ?? "public");

  const lookUp = () =>
    run(() => lookUpRecording({ url }), {
      key: "lookup",
      refresh: false,
      onOk: (outcome) => {
        if (!outcome.ok) return;
        setFound(true);
        setUrl(outcome.value.canonicalUrl);
        if (!title && outcome.value.title) setTitle(outcome.value.title);
        if (!sourceName && outcome.value.sourceName) setSourceName(outcome.value.sourceName);
      },
    });

  const details = { title, sourceName, arrangement, musicKey, description, visibility };
  const save = () =>
    run(() => (recording ? updateRecording({ id: recording.id, ...details }) : addRecording({ songId, url, ...details })), {
      key: "save",
      toast: true,
      onOk: (outcome) => {
        if (outcome.ok) onSaved({ kind: "recording-saved", recording: outcome.value });
        onClose();
      },
    });

  return (
    <Modal
      title={recording ? copy.edit : copy.addRecording}
      subtitle={songTitle}
      closeLabel={copy.cancel}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            {copy.cancel}
          </Button>
          {found ? (
            <Button onClick={save} state={stateOf("save")} pendingLabel={copy.saving} disabled={pending || !title.trim()}>
              {copy.save}
            </Button>
          ) : null}
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (found) save();
          else lookUp();
        }}
      >
        {recording ? (
          <p className="break-all text-sm text-muted">{recording.sourceUrl}</p>
        ) : (
          <div>
            <TextField
              id={`${id}-url`}
              label={fields.url}
              value={url}
              maxLength={2048}
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(value) => {
                setUrl(value);
                setFound(false);
                clear();
              }}
            />
            <p className="mt-1.5 text-xs text-muted">{copy.recordingHelp}</p>
            {!found ? (
              <Button type="submit" variant="secondary" className="mt-3" state={stateOf("lookup")} pendingLabel={copy.lookingUp} disabled={pending || !url.trim()}>
                {copy.lookUp}
              </Button>
            ) : null}
          </div>
        )}
        {found ? (
          <>
            <TextField id={`${id}-title`} label={fields.title} value={title} maxLength={200} required onChange={setTitle} />
            <TextField id={`${id}-source`} label={fields.sourceName} value={sourceName} maxLength={120} onChange={setSourceName} />
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <TextField id={`${id}-arrangement`} label={fields.arrangement} hint={fields.arrangementHint} value={arrangement} maxLength={120} onChange={setArrangement} />
              <TextField id={`${id}-key`} label={fields.musicKey} value={musicKey} maxLength={30} onChange={setMusicKey} />
            </div>
            <TextField id={`${id}-notes`} label={fields.description} value={description} maxLength={1000} multiline rows={3} onChange={setDescription} />
            <VisibilityField name={`${id}-visibility`} value={visibility} onChange={setVisibility} />
            {/* Enter saves. */}
            <button type="submit" className="sr-only" tabIndex={-1}>
              {copy.save}
            </button>
          </>
        ) : null}
        <ActionMessage result={result} />
      </form>
    </Modal>
  );
}

/** Adding or changing an external media link - opened elsewhere, never played here. */
export function LinkForm({
  songId,
  songTitle,
  link,
  onClose,
  onSaved,
}: {
  songId: string;
  songTitle: string;
  link?: MediaLink;
  onClose: () => void;
  onSaved: (change: RecordingChange) => void;
}) {
  const id = useId();
  const { run, pending, result, stateOf } = useAction();
  const [url, setUrl] = useState(link?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? "");
  const [description, setDescription] = useState(link?.description ?? "");
  const [visibility, setVisibility] = useState<RecordingVisibility>(link?.visibility ?? "public");

  const save = () =>
    run(
      () =>
        link
          ? editMediaLink({ id: link.id, url, title, description, visibility })
          : addMediaLink({ songId, url, title, description, visibility }),
      {
        key: "save",
        toast: true,
        onOk: (outcome) => {
          if (outcome.ok) onSaved({ kind: "link-saved", link: outcome.value });
          onClose();
        },
      },
    );

  return (
    <Modal
      title={link ? copy.edit : copy.addLink}
      subtitle={songTitle}
      closeLabel={copy.cancel}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button onClick={save} state={stateOf("save")} pendingLabel={copy.saving} disabled={pending || !url.trim() || !title.trim()}>
            {copy.save}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p className="text-sm text-muted">{copy.linkHelp}</p>
        <TextField id={`${id}-url`} label={fields.url} value={url} maxLength={2048} type="url" required placeholder="https://drive.google.com/…" onChange={setUrl} />
        <TextField id={`${id}-title`} label={fields.title} value={title} maxLength={200} required onChange={setTitle} />
        <TextField id={`${id}-notes`} label={fields.description} value={description} maxLength={1000} multiline rows={3} onChange={setDescription} />
        <VisibilityField name={`${id}-visibility`} value={visibility} onChange={setVisibility} />
        <button type="submit" className="sr-only" tabIndex={-1}>
          {copy.save}
        </button>
        <ActionMessage result={result} />
      </form>
    </Modal>
  );
}
