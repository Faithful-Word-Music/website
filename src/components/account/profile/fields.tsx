"use client";

import { useUser } from "@clerk/nextjs";
import { useId, useRef, useState } from "react";

import { ActionMessage, ChoiceChips, SelectField, TextField } from "@/components/account/fields";
import { LearningScaleInput } from "@/components/account/LearningScale";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";
import type { AboutValues, MusicValues, SharedMusicValues, SongLeadingValues } from "@/lib/auth/forms";
import {
  LEADING_COMFORT,
  LEADING_EXPERIENCE,
  PROFICIENCIES,
  PROFILE_LIMITS,
  THEORY_LEVELS,
  VOICE_PARTS,
  type Proficiency,
} from "@/lib/auth/profile-options";
import type { RequirementKey } from "@/lib/auth/profile-requirements";

/**
 * The profile's questions as controlled groups of fields, shared by the
 * profile editor (/profile/edit, one save per section) and onboarding
 * (/welcome, a step at a time). The groups hold no state and save nothing:
 * the form around them does. Validation here only helps; the server checks
 * everything again (src/lib/auth/forms.ts).
 */

const copy = profileSetupContent.sections;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** A question's tag: required for this person, or optional. */
export function tagFor(required: ReadonlySet<RequirementKey>, ...keys: RequirementKey[]): string {
  return keys.some((key) => required.has(key)) ? profileSetupContent.required : profileSetupContent.optional;
}

export type FieldErrors = Partial<Record<string, string>>;

// ---------------------------------------------------------------------------
// About you
// ---------------------------------------------------------------------------

export function validateAbout(values: AboutValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.firstName.trim()) errors.firstName = "Please enter your first name.";
  if (!values.lastName.trim()) errors.lastName = "Please enter your last name.";
  if (!/^[\d\s()+.-]*$/.test(values.phone)) errors.phone = "Please use only digits, spaces and + ( ) - in your phone number.";
  return errors;
}

export function AboutFields({
  values,
  errors,
  onChange,
}: {
  values: AboutValues;
  errors: FieldErrors;
  onChange: (next: AboutValues) => void;
}) {
  const ids = useId();
  const set = <K extends keyof AboutValues>(key: K, value: AboutValues[K]) => onChange({ ...values, [key]: value });
  return (
    <div className="space-y-5">
      <PhotoField />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <TextField
          id={`${ids}-first`}
          label={copy.about.first}
          hint={profileSetupContent.required}
          required
          value={values.firstName}
          error={errors.firstName}
          maxLength={PROFILE_LIMITS.firstName}
          autoComplete="given-name"
          onChange={(value) => set("firstName", value)}
        />
        <TextField
          id={`${ids}-middle`}
          label={copy.about.middle}
          hint={profileSetupContent.optional}
          value={values.middleName}
          maxLength={PROFILE_LIMITS.middleName}
          autoComplete="additional-name"
          onChange={(value) => set("middleName", value)}
        />
        <TextField
          id={`${ids}-last`}
          label={copy.about.last}
          hint={profileSetupContent.required}
          required
          value={values.lastName}
          error={errors.lastName}
          maxLength={PROFILE_LIMITS.lastName}
          autoComplete="family-name"
          onChange={(value) => set("lastName", value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id={`${ids}-preferred`}
          label={copy.about.preferred}
          hint={`${profileSetupContent.optional} · ${copy.about.preferredHint}`}
          value={values.preferredName}
          maxLength={PROFILE_LIMITS.preferredName}
          autoComplete="nickname"
          onChange={(value) => set("preferredName", value)}
        />
        <TextField
          id={`${ids}-phone`}
          label={copy.about.phone}
          hint={`${profileSetupContent.optional} · ${copy.about.phoneHint}`}
          value={values.phone}
          error={errors.phone}
          maxLength={PROFILE_LIMITS.phone}
          type="tel"
          autoComplete="tel"
          onChange={(value) => set("phone", value)}
        />
      </div>
      <TextField
        id={`${ids}-bio`}
        label={copy.about.bio}
        hint={`${profileSetupContent.optional} · up to ${PROFILE_LIMITS.bio} characters`}
        placeholder={copy.about.bioPlaceholder}
        value={values.bio}
        maxLength={PROFILE_LIMITS.bio}
        multiline
        rows={4}
        onChange={(value) => set("bio", value)}
      />
    </div>
  );
}

/** Profile photo, stored by Clerk and saved as soon as it is chosen. Never required. */
export function PhotoField() {
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, result, clear, run, stateOf } = useAction();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  function upload(file: File | null) {
    if (!user) return;
    setError(null);
    clear();
    if (file && !file.type.startsWith("image/")) return setError(copy.about.photoWrongType);
    if (file && file.size > MAX_PHOTO_BYTES) return setError(copy.about.photoTooLarge);
    void run(
      async () => {
        try {
          await user.setProfileImage({ file });
          await user.reload();
          return { ok: true, message: file ? feedbackContent.photoSaved : feedbackContent.photoRemoved };
        } catch {
          return { ok: false, error: copy.about.photoFailed };
        } finally {
          if (inputRef.current) inputRef.current.value = "";
        }
      },
      // Clerk holds the photo, so the page has nothing of its own to reload.
      { key: file ? "upload" : "remove", refresh: false },
    );
  }

  return (
    <div className="flex items-center gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo */}
      <img src={user.imageUrl} alt="" width={80} height={80} className="h-20 w-20 shrink-0 rounded-full border border-line object-cover" />
      <div>
        <p className="flex items-baseline gap-3 text-sm font-medium text-ink">
          {copy.about.photo}
          <span className="text-xs font-normal text-muted">{profileSetupContent.optional}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            state={stateOf("upload")}
            pendingLabel={feedbackContent.saving}
            doneLabel={feedbackContent.saved}
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {user.hasImage ? copy.about.photoChange : copy.about.photoUpload}
          </Button>
          {user.hasImage || stateOf("remove") !== "idle" ? (
            <Button
              type="button"
              variant="quiet"
              state={stateOf("remove")}
              pendingLabel={feedbackContent.removing}
              doneLabel={feedbackContent.removed}
              disabled={pending}
              onClick={() => upload(null)}
            >
              {copy.about.photoRemove}
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-label={copy.about.photoChoose}
          onChange={(event) => {
            // Cancelling the file picker gives no file - that must not remove the photo.
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <div className="mt-2">
          <ActionMessage result={error ? { ok: false, error } : result} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instruments (musicians)
// ---------------------------------------------------------------------------

/** An instrument being edited: its proficiency is "" until chosen - never filled in for the person. */
export interface DraftInstrument {
  instrumentId: number;
  proficiency: Proficiency | "";
  isPrimary: boolean;
}
export interface MusicDraft {
  instruments: DraftInstrument[];
  learningStyle: MusicValues["learningStyle"];
}

export function validateMusic(values: MusicDraft, required: ReadonlySet<RequirementKey>): FieldErrors {
  const errors: FieldErrors = {};
  if (required.has("instruments") && values.instruments.length === 0) errors.instruments = "Please choose at least one instrument.";
  for (const item of values.instruments) {
    if (!item.proficiency) errors[`proficiency-${item.instrumentId}`] = "Please choose how well you play it.";
  }
  if (values.instruments.length > 0 && values.instruments.filter((item) => item.isPrimary).length !== 1) {
    errors.primary = "Please choose your primary instrument.";
  }
  if (required.has("learning_style") && values.learningStyle === null) errors.learningStyle = "Please choose how you play.";
  return errors;
}

/** Ready to send, once validateMusic() found nothing. */
export function toMusicValues(values: MusicDraft): MusicValues {
  return {
    instruments: values.instruments.map((item) => ({ ...item, proficiency: item.proficiency as Proficiency })),
    learningStyle: values.learningStyle,
  };
}

export function MusicFields({
  values,
  errors,
  options,
  isMusician,
  required,
  onChange,
}: {
  values: MusicDraft;
  errors: FieldErrors;
  options: ReadonlyArray<{ id: number; label: string }>;
  /** Only musicians are asked "How do you play?". */
  isMusician: boolean;
  required: ReadonlySet<RequirementKey>;
  onChange: (next: MusicDraft) => void;
}) {
  const ids = useId();

  function toggle(instrumentId: number) {
    const has = values.instruments.some((item) => item.instrumentId === instrumentId);
    const instruments = has
      ? values.instruments.filter((item) => item.instrumentId !== instrumentId)
      : [...values.instruments, { instrumentId, proficiency: "" as const, isPrimary: values.instruments.length === 0 }];
    // Removing the primary leaves the only other one as primary, never none chosen silently among several.
    if (has && instruments.length === 1 && !instruments[0].isPrimary) instruments[0] = { ...instruments[0], isPrimary: true };
    onChange({ ...values, instruments });
  }

  function update(instrumentId: number, change: Partial<DraftInstrument>) {
    onChange({
      ...values,
      instruments: values.instruments.map((item) => {
        if (item.instrumentId === instrumentId) return { ...item, ...change };
        return change.isPrimary ? { ...item, isPrimary: false } : item;
      }),
    });
  }

  return (
    <div className="space-y-6">
      <fieldset aria-describedby={errors.instruments || errors.primary ? `${ids}-instruments-error` : undefined}>
        <legend className="mb-1.5 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-ink">
          <span className="min-w-0">{copy.music.legend}</span>
          <span className="shrink-0 text-xs font-normal text-muted">{tagFor(required, "instruments")}</span>
        </legend>
        <p className="-mt-1 text-xs text-muted">{copy.music.legendHint}</p>
        <dl className="mb-3 mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
          {PROFICIENCIES.map((level) => (
            <div key={level.value}>
              <dt className="inline font-medium text-ink">{level.label}:</dt> <dd className="inline">{level.description}</dd>
            </div>
          ))}
        </dl>
        <ul className="divide-y divide-line rounded-card border border-line">
          {options.map((option) => {
            const chosen = values.instruments.find((item) => item.instrumentId === option.id);
            const problem = chosen ? errors[`proficiency-${option.id}`] : undefined;
            return (
              <li key={option.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={Boolean(chosen)}
                    onChange={() => toggle(option.id)}
                    className="h-4 w-4 accent-[var(--color-ink)]"
                  />
                  {option.label}
                </label>
                {chosen ? (
                  <div className="flex flex-wrap items-center gap-3 pl-7 sm:pl-0">
                    <SelectField
                      id={`${ids}-prof-${option.id}`}
                      label={copy.music.proficiencyLabel.replace("{instrument}", option.label)}
                      value={chosen.proficiency}
                      placeholder={copy.music.proficiencyPlaceholder}
                      options={PROFICIENCIES}
                      invalid={Boolean(problem)}
                      onChange={(proficiency) => update(option.id, { proficiency })}
                      className="w-40"
                    />
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-muted">
                      <input
                        type="radio"
                        name={`${ids}-primary`}
                        checked={chosen.isPrimary}
                        onChange={() => update(option.id, { isPrimary: true })}
                        className="accent-[var(--color-ink)]"
                      />
                      {copy.music.primary}
                    </label>
                    {problem ? <p className="w-full text-sm text-gold-dark">{problem}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {errors.instruments || errors.primary ? (
          <p id={`${ids}-instruments-error`} className="mt-1.5 text-sm text-gold-dark">
            {errors.instruments ?? errors.primary}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">{copy.music.missing}</p>
      </fieldset>

      {isMusician ? (
        <div>
          <LearningScaleInput
            name={`${ids}-learning`}
            value={values.learningStyle}
            required={required.has("learning_style")}
            onChange={(next) => onChange({ ...values, learningStyle: next })}
          />
          <p className="mt-1 text-xs text-muted">{tagFor(required, "learning_style")}</p>
          {errors.learningStyle ? <p className="mt-1.5 text-sm text-gold-dark">{errors.learningStyle}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reading music (everyone who plays or leads, asked once)
// ---------------------------------------------------------------------------

export function validateShared(values: SharedMusicValues, required: ReadonlySet<RequirementKey>): FieldErrors {
  return required.has("reads_sheet_music") && values.readsSheetMusic === null ? { readsSheetMusic: "Please answer Yes or No." } : {};
}

export function SharedMusicFields({
  values,
  errors,
  required,
  onChange,
}: {
  values: SharedMusicValues;
  errors: FieldErrors;
  required: ReadonlySet<RequirementKey>;
  onChange: (next: SharedMusicValues) => void;
}) {
  const ids = useId();
  return (
    <div className="space-y-6">
      <ChoiceChips
        name={`${ids}-reads`}
        legend={copy.shared.reads}
        tag={tagFor(required, "reads_sheet_music")}
        required={required.has("reads_sheet_music")}
        error={errors.readsSheetMusic}
        options={[
          { value: "yes", label: copy.shared.yes },
          { value: "no", label: copy.shared.no },
        ]}
        selected={values.readsSheetMusic === null ? [] : [values.readsSheetMusic ? "yes" : "no"]}
        onChange={(next) => onChange({ ...values, readsSheetMusic: next[0] === undefined ? null : next[0] === "yes" })}
      />
      <ChoiceChips
        name={`${ids}-voice`}
        legend={copy.shared.voice}
        tag={profileSetupContent.optional}
        options={VOICE_PARTS}
        selected={values.voicePart ? [values.voicePart] : []}
        onChange={(next) => onChange({ ...values, voicePart: next[0] ?? null })}
      />
      <ChoiceChips
        name={`${ids}-theory`}
        legend={copy.shared.theory}
        tag={profileSetupContent.optional}
        describe
        explainLabel={copy.explain}
        options={THEORY_LEVELS}
        selected={values.theoryLevel ? [values.theoryLevel] : []}
        onChange={(next) => onChange({ ...values, theoryLevel: next[0] ?? null })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Song leading
// ---------------------------------------------------------------------------

export function validateLeading(values: SongLeadingValues, required: ReadonlySet<RequirementKey>): FieldErrors {
  const errors: FieldErrors = {};
  if (required.has("leading_experience") && values.experience === null) errors.experience = "Please choose one.";
  if (required.has("leading_unfamiliar") && values.unfamiliarHymns === null) errors.unfamiliarHymns = "Please choose one.";
  if (required.has("leading_unaccompanied") && values.unaccompaniedLeading === null) errors.unaccompaniedLeading = "Please choose one.";
  return errors;
}

export function SongLeadingFields({
  values,
  errors,
  required,
  onChange,
}: {
  values: SongLeadingValues;
  errors: FieldErrors;
  required: ReadonlySet<RequirementKey>;
  onChange: (next: SongLeadingValues) => void;
}) {
  const ids = useId();
  return (
    <div className="space-y-6">
      <ChoiceChips
        name={`${ids}-experience`}
        legend={copy.leading.experience}
        tag={tagFor(required, "leading_experience")}
        required={required.has("leading_experience")}
        describe
        explainLabel={copy.explain}
        error={errors.experience}
        options={LEADING_EXPERIENCE}
        selected={values.experience ? [values.experience] : []}
        onChange={(next) => onChange({ ...values, experience: next[0] ?? null })}
      />
      <ChoiceChips
        name={`${ids}-unfamiliar`}
        legend={copy.leading.unfamiliar}
        tag={tagFor(required, "leading_unfamiliar")}
        required={required.has("leading_unfamiliar")}
        describe
        explainLabel={copy.explain}
        error={errors.unfamiliarHymns}
        options={LEADING_COMFORT}
        selected={values.unfamiliarHymns ? [values.unfamiliarHymns] : []}
        onChange={(next) => onChange({ ...values, unfamiliarHymns: next[0] ?? null })}
      />
      <ChoiceChips
        name={`${ids}-unaccompanied`}
        legend={copy.leading.unaccompanied}
        tag={tagFor(required, "leading_unaccompanied")}
        required={required.has("leading_unaccompanied")}
        describe
        explainLabel={copy.explain}
        error={errors.unaccompaniedLeading}
        options={LEADING_COMFORT}
        selected={values.unaccompaniedLeading ? [values.unaccompaniedLeading] : []}
        onChange={(next) => onChange({ ...values, unaccompaniedLeading: next[0] ?? null })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparing answers
// ---------------------------------------------------------------------------

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
