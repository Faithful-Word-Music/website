"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { saveProfileSection } from "@/app/profile/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";
import type { AboutValues, ProfileSection, SharedMusicValues, SongLeadingValues } from "@/lib/auth/forms";
import type { RequirementKey } from "@/lib/auth/profile-requirements";

import {
  AboutFields,
  MusicFields,
  same,
  SharedMusicFields,
  SongLeadingFields,
  toMusicValues,
  validateAbout,
  validateLeading,
  validateMusic,
  validateShared,
  type FieldErrors,
  type MusicDraft,
} from "./fields";
import { SaveBar } from "./SaveBar";
import { UnsavedChangesPrompt } from "./UnsavedChangesPrompt";

const copy = profileSetupContent.sections;

export interface EditorInitial {
  about: AboutValues;
  music: MusicDraft;
  shared: SharedMusicValues;
  leading: SongLeadingValues;
}

/**
 * /profile/edit: the profile in sections, each saved on its own so one
 * never overwrites another. Which sections show follows the person's roles:
 * instruments for musicians (or anyone who already lists one), song leading
 * for song leaders; reading music is asked once for everyone. Required and
 * optional questions are labelled from the same requirement engine the
 * gate uses.
 */
export function ProfileEditor({
  initial,
  instrumentOptions,
  show,
  isMusician,
  required,
}: {
  initial: EditorInitial;
  instrumentOptions: Array<{ id: number; label: string }>;
  show: { music: boolean; leading: boolean };
  isMusician: boolean;
  required: RequirementKey[];
}) {
  const needs = new Set(required);
  // Which sections hold unsaved answers: one guard for the page asks before any of them is lost.
  const [unsaved, setUnsaved] = useState<ReadonlySet<ProfileSection>>(new Set());
  const report = useCallback((section: ProfileSection, isDirty: boolean) => {
    setUnsaved((now) => {
      if (now.has(section) === isDirty) return now;
      const next = new Set(now);
      if (isDirty) next.add(section);
      else next.delete(section);
      return next;
    });
  }, []);
  return (
    <div className="space-y-6">
      <UnsavedChangesPrompt dirty={unsaved.size > 0} />
      <Section<AboutValues>
        section="about"
        title={copy.about.title}
        lead={copy.about.lead}
        initial={initial.about}
        onDirtyChange={report}
        validate={validateAbout}
        toInput={(values) => values}
        render={(values, errors, onChange) => <AboutFields values={values} errors={errors} onChange={onChange} />}
      />
      {show.music ? (
        <Section<MusicDraft>
          section="music"
          title={copy.music.title}
          lead={copy.music.lead}
          initial={initial.music}
          onDirtyChange={report}
        validate={(values) => validateMusic(values, needs)}
          toInput={toMusicValues}
          render={(values, errors, onChange) => (
            <MusicFields
              values={values}
              errors={errors}
              options={instrumentOptions}
              isMusician={isMusician}
              required={needs}
              onChange={onChange}
            />
          )}
        />
      ) : null}
      <Section<SharedMusicValues>
        section="shared"
        title={copy.shared.title}
        lead={copy.shared.lead}
        initial={initial.shared}
        onDirtyChange={report}
        validate={(values) => validateShared(values, needs)}
        toInput={(values) => values}
        render={(values, errors, onChange) => <SharedMusicFields values={values} errors={errors} required={needs} onChange={onChange} />}
      />
      {show.leading ? (
        <Section<SongLeadingValues>
          section="leading"
          title={copy.leading.title}
          lead={copy.leading.lead}
          initial={initial.leading}
          onDirtyChange={report}
        validate={(values) => validateLeading(values, needs)}
          toInput={(values) => values}
          render={(values, errors, onChange) => <SongLeadingFields values={values} errors={errors} required={needs} onChange={onChange} />}
        />
      ) : null}
    </div>
  );
}

function Section<T>({
  section,
  title,
  lead,
  initial,
  validate,
  toInput,
  render,
  onDirtyChange,
}: {
  section: ProfileSection;
  onDirtyChange: (section: ProfileSection, dirty: boolean) => void;
  title: string;
  lead: string;
  initial: T;
  validate: (values: T) => FieldErrors;
  toInput: (values: T) => unknown;
  render: (values: T, errors: FieldErrors, onChange: (next: T) => void) => ReactNode;
}) {
  const ids = useId();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { result, clear, run, stateOf, pending } = useAction();
  const dirty = !same(values, saved);
  useEffect(() => onDirtyChange(section, dirty), [onDirtyChange, section, dirty]);
  useEffect(() => () => onDirtyChange(section, false), [onDirtyChange, section]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const sent = values;
    void run(() => saveProfileSection(section, toInput(sent)), { onOk: () => setSaved(sent) });
  }

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={onSubmit} aria-labelledby={`${ids}-title`} noValidate>
        <h2 id={`${ids}-title`} className="font-display text-2xl text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{lead}</p>
        <div className="mt-6">
          {render(values, errors, (next) => {
            setValues(next);
            clear();
          })}
        </div>
        <SaveBar
          dirty={dirty}
          busy={stateOf() !== "idle"}
          // A save that worked is said by the bar itself ("All changes saved"); only a problem needs its own line.
          message={<ActionMessage result={result?.ok ? null : result} />}
          button={
            <Button type="submit" state={stateOf()} pendingLabel={feedbackContent.saving} doneLabel={feedbackContent.saved} disabled={pending}>
              {copy.save}
            </Button>
          }
        />
      </form>
    </Card>
  );
}
