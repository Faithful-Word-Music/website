"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { saveOwnProfile } from "@/app/profile/actions";
import { ActionMessage, ChoiceChips, SelectField, TextField } from "@/components/account/fields";
import { LearningScaleInput } from "@/components/account/LearningScale";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { accountContent } from "@/content/account";
import type { ProfileFormValues } from "@/lib/auth/forms";
import {
  PROFICIENCIES,
  PROFILE_LIMITS,
  SERVICE_AVAILABILITY,
  THEORY_LEVELS,
  VOICE_PARTS,
  type Proficiency,
} from "@/lib/auth/profile-options";

type Result = { ok: boolean; message?: string; error?: string } | null;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * The profile form on /profile/edit. The photo is saved straight to Clerk
 * (which stores and serves profile images); everything else is saved in one
 * go by the saveOwnProfile server action.
 */
export function ProfileForm({
  initial,
  instrumentOptions,
  isMusician,
  welcome = false,
}: {
  initial: ProfileFormValues;
  instrumentOptions: Array<{ id: number; label: string }>;
  /** Only musicians are asked "How do you play?". */
  isMusician: boolean;
  /** A new member's first visit: saving or skipping goes on to their Dashboard. */
  welcome?: boolean;
}) {
  const ids = useId();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleInstrument(instrumentId: number) {
    setValues((current) => {
      const has = current.instruments.some((item) => item.instrumentId === instrumentId);
      return {
        ...current,
        instruments: has
          ? current.instruments.filter((item) => item.instrumentId !== instrumentId)
          : [
              ...current.instruments,
              { instrumentId, proficiency: "comfortable", isPrimary: current.instruments.length === 0 },
            ],
      };
    });
  }

  function updateInstrument(instrumentId: number, change: { proficiency?: Proficiency; isPrimary?: boolean }) {
    setValues((current) => ({
      ...current,
      instruments: current.instruments.map((item) => {
        if (item.instrumentId === instrumentId) return { ...item, ...change };
        // Only one primary instrument.
        return change.isPrimary ? { ...item, isPrimary: false } : item;
      }),
    }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const outcome = await saveOwnProfile(values);
      setResult(outcome);
      if (outcome.ok && welcome) router.push("/dashboard");
      else if (outcome.ok) router.refresh();
    });
  }


  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="p-6 sm:p-8">
        <h2 className="font-display text-2xl text-ink">About you</h2>
        <div className="mt-6">
          <PhotoField />
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <TextField
            id={`${ids}-first`}
            label="First name"
            value={values.firstName}
            maxLength={PROFILE_LIMITS.firstName}
            autoComplete="given-name"
            onChange={(value) => set("firstName", value)}
          />
          <TextField
            id={`${ids}-middle`}
            label="Middle name"
            hint="Optional"
            value={values.middleName}
            maxLength={PROFILE_LIMITS.middleName}
            autoComplete="additional-name"
            onChange={(value) => set("middleName", value)}
          />
          <TextField
            id={`${ids}-last`}
            label="Last name"
            value={values.lastName}
            maxLength={PROFILE_LIMITS.lastName}
            autoComplete="family-name"
            onChange={(value) => set("lastName", value)}
          />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextField
            id={`${ids}-preferred`}
            label="Preferred name"
            hint="Optional - what people call you"
            value={values.preferredName}
            maxLength={PROFILE_LIMITS.preferredName}
            autoComplete="nickname"
            onChange={(value) => set("preferredName", value)}
          />
          <TextField
            id={`${ids}-phone`}
            label="Phone"
            hint="Optional - only administrators see it"
            value={values.phone}
            maxLength={PROFILE_LIMITS.phone}
            type="tel"
            autoComplete="tel"
            onChange={(value) => set("phone", value)}
          />
        </div>
        <div className="mt-5">
          <TextField
            id={`${ids}-bio`}
            label="About you"
            hint={`Optional - up to ${PROFILE_LIMITS.bio} characters`}
            placeholder="A sentence or two about yourself and your part in the music ministry."
            value={values.bio}
            maxLength={PROFILE_LIMITS.bio}
            multiline
            rows={4}
            onChange={(value) => set("bio", value)}
          />
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <h2 className="font-display text-2xl text-ink">Music</h2>
        <div className="mt-6 space-y-6">
          <ChoiceChips
            name={`${ids}-voice`}
            legend="Voice part"
            hint="Optional"
            options={VOICE_PARTS}
            selected={values.voicePart ? [values.voicePart] : []}
            onChange={(next) => set("voicePart", next[0] ?? null)}
          />

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Instruments you play</legend>
            <p className="-mt-1 text-xs text-muted">Choose each one, then how well you play it:</p>
            <dl className="mb-3 mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
              {PROFICIENCIES.map((level) => (
                <div key={level.value}>
                  <dt className="inline font-medium text-ink">{level.label}:</dt> <dd className="inline">{level.description}</dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-line rounded-card border border-line">
              {instrumentOptions.map((option) => {
                const chosen = values.instruments.find((item) => item.instrumentId === option.id);
                return (
                  <li key={option.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
                        onChange={() => toggleInstrument(option.id)}
                        className="h-4 w-4 accent-[var(--color-ink)]"
                      />
                      {option.label}
                    </label>
                    {chosen ? (
                      <div className="flex items-center gap-3 pl-7 sm:pl-0">
                        <SelectField
                          id={`${ids}-prof-${option.id}`}
                          label={`How well you play ${option.label}`}
                          value={chosen.proficiency}
                          options={PROFICIENCIES}
                          onChange={(proficiency) => updateInstrument(option.id, { proficiency })}
                          className="w-40"
                        />
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                          <input
                            type="radio"
                            name={`${ids}-primary`}
                            checked={chosen.isPrimary}
                            onChange={() => updateInstrument(option.id, { isPrimary: true })}
                            className="accent-[var(--color-ink)]"
                          />
                          Primary
                        </label>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">Missing an instrument? Ask an administrator to add it to the list.</p>
          </fieldset>

          <ChoiceChips
            name={`${ids}-reads`}
            legend="Can you read sheet music?"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            selected={values.readsSheetMusic === null ? [] : [values.readsSheetMusic ? "yes" : "no"]}
            onChange={(next) => set("readsSheetMusic", next[0] === undefined ? null : next[0] === "yes")}
          />

          {/* Only musicians are asked how they play; everything else is for everyone. */}
          {isMusician ? (
            <LearningScaleInput
              name={`${ids}-learning`}
              value={values.learningStyle}
              onChange={(next) => set("learningStyle", next)}
            />
          ) : null}

          <ChoiceChips
            name={`${ids}-theory`}
            legend="Music theory"
            hint={THEORY_LEVELS.map((level) => `${level.label}: ${level.description}`).join(" ")}
            options={THEORY_LEVELS}
            selected={values.theoryLevel ? [values.theoryLevel] : []}
            onChange={(next) => set("theoryLevel", next[0] ?? null)}
          />

          <ChoiceChips
            name={`${ids}-availability`}
            legend="Services you are usually available for"
            hint="Optional - choose any"
            options={SERVICE_AVAILABILITY}
            selected={values.serviceAvailability}
            multiple
            onChange={(next) => set("serviceAvailability", next)}
          />
        </div>
      </Card>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ActionMessage result={result} />
        <div className="flex shrink-0 gap-3 sm:ml-auto">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => router.push(welcome ? "/dashboard" : "/profile")}
          >
            {welcome ? accountContent.profile.welcome.skip : "Cancel"}
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : welcome ? accountContent.profile.welcome.save : "Save profile"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Profile photo, stored by Clerk. Saved as soon as it is chosen, separately
 * from the rest of the form.
 */
function PhotoField() {
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function upload(file: File | null) {
    if (!user) return;
    setError(null);
    if (file && !file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file && file.size > MAX_PHOTO_BYTES) return setError("Please choose an image under 10 MB.");
    setBusy(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
    } catch {
      setError("The photo could not be saved. Please try another image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo */}
      <img
        src={user.imageUrl}
        alt=""
        width={80}
        height={80}
        className="h-20 w-20 shrink-0 rounded-full border border-line object-cover"
      />
      <div>
        <p className="text-sm font-medium text-ink">Profile photo</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Saving…" : user.hasImage ? "Change photo" : "Upload photo"}
          </Button>
          {user.hasImage ? (
            <Button type="button" variant="quiet" disabled={busy} onClick={() => upload(null)}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a profile photo"
          onChange={(event) => {
            // Cancelling the file picker gives no file - that must not remove the photo.
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {error ? <p className="mt-2 text-sm text-gold-dark">{error}</p> : null}
      </div>
    </div>
  );
}
