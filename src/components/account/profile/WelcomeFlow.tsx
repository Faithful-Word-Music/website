"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { completeOnboardingStep, saveProfileSection } from "@/app/profile/actions";
import { ActionMessage } from "@/components/account/fields";
import { NormalServicesForm } from "@/components/availability/NormalServicesForm";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";
import type { ProfileSection } from "@/lib/auth/forms";
import type { OnboardingPlan, OnboardingStep } from "@/lib/auth/onboarding";
import type { ServiceAvailability } from "@/lib/auth/profile-options";
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
} from "./fields";
import type { EditorInitial } from "./ProfileEditor";
import { LeaveDialog, UnsavedChangesPrompt } from "./UnsavedChangesPrompt";

const copy = profileSetupContent.welcome;
const sections = profileSetupContent.sections;

interface WelcomeForm {
  initial: EditorInitial;
  instrumentOptions: Array<{ id: number; label: string }>;
  isMusician: boolean;
  show: { music: boolean; leading: boolean };
  required: RequirementKey[];
  normal: { services: ServiceAvailability[]; reviewed: boolean };
  firstName: string;
  userId: string;
  blocked: boolean;
}

/**
 * Onboarding, one step at a time (/welcome). The server decides which steps
 * there are and where to pick up (onboarding.ts); this shows the step,
 * saves it through the same actions as the profile editor, and then asks
 * the server again - so what counts as done is always what was saved.
 */
export function WelcomeFlow({
  plan,
  step,
  next,
  form,
  push,
  preferences,
}: {
  plan: OnboardingPlan;
  step: OnboardingStep | null;
  next: string;
  form: WelcomeForm;
  push: ReactNode;
  preferences: ReactNode;
}) {
  const router = useRouter();
  const ids = useId();
  const href = (target: OnboardingStep | null) => {
    const query = new URLSearchParams();
    if (target) query.set("step", target);
    if (next !== "/dashboard") query.set("next", next);
    const text = query.toString();
    return text ? `/welcome?${text}` : "/welcome";
  };
  // After a save: back to the server, which works out the next step from what is now saved.
  // The unsaved-changes guard lets go first, so the replace never lands on top of its extra history entry.
  const advance = () => router.replace(href(null));

  // Unsaved answers in this step. The site's guard covers leaving /welcome (links elsewhere,
  // Back and Forward to other pages, closing); moving between steps stays on /welcome, which it
  // lets through on purpose - so the steps ask here, in the same dialog.
  const [stepDirty, setStepDirty] = useState(false);
  const reportDirty = useCallback((dirty: boolean) => setStepDirty(dirty), []);
  const [held, setHeld] = useState<{ kind: "page"; href: string } | { kind: "history"; key: string } | null>(null);
  const confirmed = useRef(false);
  const holdLink = (target: string) => (event: React.MouseEvent) => {
    if (!stepDirty || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setHeld({ kind: "page", href: target });
  };
  useEffect(() => {
    const navigation = (window as unknown as { navigation?: EventTarget & { traverseTo(key: string): unknown } }).navigation;
    if (!stepDirty || !navigation) return;
    confirmed.current = false;
    const onNavigate = (event: Event) => {
      const navigate = event as Event & { navigationType: string; destination: { url: string; key: string } };
      if (confirmed.current || navigate.navigationType !== "traverse" || !navigate.cancelable) return;
      // Another page is the site guard's to ask about; another step of onboarding is ours.
      if (new URL(navigate.destination.url).pathname !== window.location.pathname) return;
      navigate.preventDefault();
      setHeld({ kind: "history", key: navigate.destination.key });
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, [stepDirty]);
  const leaveStep = () => {
    if (!held) return;
    confirmed.current = true;
    setStepDirty(false);
    setHeld(null);
    if (held.kind === "history") (window as unknown as { navigation?: { traverseTo(key: string): unknown } }).navigation?.traverseTo(held.key);
    else router.push(held.href);
  };

  const index = step ? plan.steps.findIndex((item) => item.key === step) : -1;
  const previous = index > 0 ? plan.steps[index - 1].key : null;
  const [title, lead] =
    plan.mode === "full"
      ? [copy.titleNew, copy.leadNew]
      : plan.mode === "focused"
        ? [copy.titleFocused, copy.leadFocused]
        : [copy.titleDone, copy.leadDone];

  return (
    <div>
      <UnsavedChangesPrompt dirty={stepDirty} />
      {held ? <LeaveDialog onStay={() => setHeld(null)} onLeave={leaveStep} /> : null}
      <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">{copy.eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl text-ink sm:text-4xl">
        {plan.mode === "full" && form.firstName ? `${title}, ${form.firstName}` : title}
      </h1>
      <p className="mt-2 text-base text-muted">{lead}</p>
      {form.blocked ? <p className="mt-3 text-sm text-muted">{copy.allowedWhileBlocked}</p> : null}

      {plan.steps.length > 1 ? (
        <nav aria-label={`${title}: steps`} className="mt-8">
          <ol className="flex flex-wrap gap-2">
            {plan.steps.map((item, position) => {
              const current = item.key === step;
              return (
                <li key={item.key}>
                  <Link
                    href={href(item.key)}
                    onClick={holdLink(href(item.key))}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                      current ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
                    )}
                  >
                    <span aria-hidden="true" className={cn("text-xs", current ? "text-paper/70" : "text-muted")}>
                      {item.done ? "✓" : position + 1}
                    </span>
                    {copy.steps[item.key]}
                    <span className="sr-only">
                      {" "}
                      ({item.done ? copy.stepDone : item.missing.length > 0 ? copy.stepRequired : copy.stepOptional})
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {index >= 0 ? (
            <p className="mt-3 text-xs text-muted" aria-live="polite">
              {copy.progress.replace("{n}", String(index + 1)).replace("{total}", String(plan.steps.length))}
            </p>
          ) : null}
        </nav>
      ) : null}

      <div className="mt-6">
        {step === "about" ? (
          <ProfileStep
            key="about"
            title={sections.about.title}
            lead={sections.about.lead}
            parts={["about"]}
            form={form}
            acknowledge={plan.mode === "full" ? "about" : null}
            onDone={advance}
            onDirtyChange={reportDirty}
          />
        ) : step === "ministry" ? (
          <ProfileStep
            key="ministry"
            title={copy.steps.ministry}
            lead={copy.ministryLead}
            parts={[...(form.show.music ? (["music"] as const) : []), "shared", ...(form.show.leading ? (["leading"] as const) : [])]}
            form={form}
            acknowledge={plan.mode === "full" ? "ministry" : null}
            onDone={advance}
            onDirtyChange={reportDirty}
          />
        ) : step === "availability" ? (
          <Card className="p-6 sm:p-8">
            <h2 id={`${ids}-availability`} className="font-display text-2xl text-ink">
              {sections.availability.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{sections.availability.lead}</p>
            <NormalServicesForm
              bare
              subject={{ id: form.userId, name: form.firstName, isSelf: true }}
              initial={form.normal.services}
              reviewed={form.normal.reviewed}
              onSaved={advance}
              onDirtyChange={reportDirty}
              submitLabel={copy.saveContinue}
            />
          </Card>
        ) : step === "notifications" ? (
          <AcknowledgeStep step="notifications" title={copy.notifications.title} onDone={advance}>
            <p className="text-sm text-muted">{copy.notifications.lead}</p>
            <ul className="mt-4 space-y-2 text-sm text-ink">
              <li>{copy.notifications.inApp}</li>
              <li>{copy.notifications.push}</li>
              <li>{copy.notifications.email}</li>
            </ul>
            <div className="mt-6">{push}</div>
            {preferences ? <div className="mt-6">{preferences}</div> : null}
            <p className="mt-6 text-sm">
              <Link href="/notifications/settings" className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold">
                {copy.notifications.settingsLink}
              </Link>
            </p>
          </AcknowledgeStep>
        ) : step === "intro" ? (
          <AcknowledgeStep step="intro" title={copy.intro.title} finalHref={next} onDone={advance}>
            <p className="text-sm text-muted">{copy.intro.lead}</p>
            <ul className="mt-4 space-y-2 text-sm text-ink">
              {copy.intro.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold-dark">
                    ·
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </AcknowledgeStep>
        ) : (
          <Card className="p-6 text-center sm:p-8">
            <p className="text-base text-ink">{plan.requiredDone ? copy.leadDone : copy.leadFocused}</p>
            <div className="mt-5 flex justify-center">
              <ButtonLink href={next}>{copy.toDashboard}</ButtonLink>
            </div>
          </Card>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        {previous ? (
          <Link href={href(previous)} onClick={holdLink(href(previous))} className="text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-gold">
            ← {copy.back}
          </Link>
        ) : (
          <span />
        )}
        {/* Not blocked: required answers can wait until their deadline. */}
        {step && !form.blocked && plan.mode !== "done" ? (
          <Link href={next} className="text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-gold">
            {copy.skip}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** About you, or Your ministry: one or more profile sections saved together, then on to the next step. */
function ProfileStep({
  title,
  lead,
  parts,
  form,
  acknowledge,
  onDone,
  onDirtyChange,
}: {
  title: string;
  lead: string;
  parts: ReadonlyArray<ProfileSection>;
  form: WelcomeForm;
  /** In the full walkthrough, the step is recorded as seen once saved. */
  acknowledge: "about" | "ministry" | null;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const needs = new Set(form.required);
  const [about, setAbout] = useState(form.initial.about);
  const [music, setMusic] = useState(form.initial.music);
  const [shared, setShared] = useState(form.initial.shared);
  const [leading, setLeading] = useState(form.initial.leading);
  const [errors, setErrors] = useState<Record<ProfileSection, FieldErrors>>({ about: {}, music: {}, shared: {}, leading: {} });
  const { result, clear, run, stateOf, pending } = useAction();
  // What is saved: what the page loaded with, then whatever was last saved here.
  const [saved, setSaved] = useState(form.initial);
  const current = { about, music, shared, leading };
  const dirty = parts.some((part) => !same(current[part], saved[part]));
  useEffect(() => onDirtyChange(dirty), [onDirtyChange, dirty]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<ProfileSection, FieldErrors> = {
      about: parts.includes("about") ? validateAbout(about) : {},
      music: parts.includes("music") ? validateMusic(music, needs) : {},
      shared: parts.includes("shared") ? validateShared(shared, needs) : {},
      leading: parts.includes("leading") ? validateLeading(leading, needs) : {},
    };
    setErrors(found);
    if (parts.some((part) => Object.keys(found[part]).length > 0)) return;
    const inputs: Record<ProfileSection, unknown> = { about, music: toMusicValues(music), shared, leading };
    void run(
      async () => {
        // Each section is saved on its own, in order; one refused stops here and says why.
        for (const part of parts) {
          // Unchanged since it was loaded: already saved, nothing to send.
          if (same(current[part], saved[part])) continue;
          const outcome = await saveProfileSection(part, inputs[part]);
          if (!outcome.ok) return outcome;
        }
        if (acknowledge) {
          const seen = await completeOnboardingStep(acknowledge);
          if (!seen.ok) return seen;
        }
        return { ok: true as const, value: null, message: sections.saved };
      },
      {
        refresh: false,
        onOk: () => {
          setSaved({ ...saved, about, music, shared, leading });
          onDone();
        },
      },
    );
  }

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      clear();
    };

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={submit} noValidate>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{lead}</p>
        <div className="mt-6 space-y-10">
          {parts.includes("about") ? <AboutFields values={about} errors={errors.about} onChange={change(setAbout)} /> : null}
          {parts.includes("music") ? (
            <Part title={sections.music.title}>
              <MusicFields
                values={music}
                errors={errors.music}
                options={form.instrumentOptions}
                isMusician={form.isMusician}
                required={needs}
                onChange={change(setMusic)}
              />
            </Part>
          ) : null}
          {parts.includes("shared") ? (
            <Part title={sections.shared.title}>
              <SharedMusicFields values={shared} errors={errors.shared} required={needs} onChange={change(setShared)} />
            </Part>
          ) : null}
          {parts.includes("leading") ? (
            <Part title={sections.leading.title} lead={sections.leading.lead}>
              <SongLeadingFields values={leading} errors={errors.leading} required={needs} onChange={change(setLeading)} />
            </Part>
          ) : null}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button type="submit" size="lg" state={stateOf()} pendingLabel={feedbackContent.saving} doneLabel={feedbackContent.saved} disabled={pending}>
            {copy.saveContinue}
          </Button>
          <ActionMessage result={result} />
        </div>
      </form>
    </Card>
  );
}

function Part({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** An explanatory step: continuing or skipping both record it as seen. */
function AcknowledgeStep({
  step,
  title,
  finalHref,
  onDone,
  children,
}: {
  step: "notifications" | "intro";
  title: string;
  /** The last step goes on to the Dashboard (or wherever they were headed). */
  finalHref?: string;
  onDone: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const { result, run, stateOf, pending } = useAction();
  const go = (key: string) =>
    void run(() => completeOnboardingStep(step), {
      key,
      refresh: false,
      onOk: () => (finalHref ? router.push(finalHref) : onDone()),
    });
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="button" size="lg" state={stateOf("continue")} pendingLabel={feedbackContent.saving} doneLabel={feedbackContent.saved} disabled={pending} onClick={() => go("continue")}>
          {finalHref ? copy.toDashboard : copy.continue}
        </Button>
        {!finalHref ? (
          <Button type="button" variant="quiet" state={stateOf("skip")} pendingLabel={feedbackContent.saving} doneLabel={feedbackContent.saved} disabled={pending} onClick={() => go("skip")}>
            {copy.skip}
          </Button>
        ) : null}
        <ActionMessage result={result} />
      </div>
    </Card>
  );
}
