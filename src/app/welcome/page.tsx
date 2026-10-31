import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { WelcomeFlow } from "@/components/account/profile/WelcomeFlow";
import { PushDeviceSection } from "@/components/notifications/PushDevice";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { activateOwnRequests } from "@/lib/auth/activation";
import { summarize } from "@/lib/auth/clerk";
import { ONBOARDING_STEPS, onboardingPlan, STARTED, type OnboardingStep } from "@/lib/auth/onboarding";
import { loadOwnProfileForm } from "@/lib/auth/profile-load";
import { getOnboardingProgress, markOnboardingStep } from "@/lib/auth/requirements-store";
import { PROFILE_GATE_EXEMPT, requireViewer } from "@/lib/auth/session";
import { isSitePath } from "@/lib/page-origin";
import { preferencesFor, type CategoryPreferences } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false, follow: false },
};

/**
 * /welcome - onboarding, and where anyone whose required profile answers
 * are overdue is sent (docs/profile-requirements.md). Exempt from the
 * profile gate, so it can never loop.
 *
 *   ?new=1    straight from accepting an invitation (signUpFallbackRedirectUrl):
 *             opens the full walkthrough, once
 *   ?step=    a step to show, if it is one of theirs
 *   ?next=    where to go afterwards (internal paths only; the Dashboard otherwise)
 *
 * What is done is worked out from saved answers each time, so the page
 * resumes in the same place after a reload or on another device.
 */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const viewer = await requireViewer("/welcome", PROFILE_GATE_EXEMPT);
  const params = await searchParams;
  const user = await currentUser();
  if (user) await activateOwnRequests(viewer, summarize(user).emails);
  if (params.new === "1") await markOnboardingStep(viewer.env, viewer.userId, STARTED);

  const [form, progress] = await Promise.all([loadOwnProfileForm(viewer), getOnboardingProgress(viewer.env, viewer.userId)]);
  if (!form) return null;
  const plan = onboardingPlan({ status: form.status, progress });

  const asked = typeof params.step === "string" ? (params.step as OnboardingStep) : null;
  const step = asked && ONBOARDING_STEPS.includes(asked) && plan.steps.some((item) => item.key === asked) ? asked : plan.current;
  const requestedNext = typeof params.next === "string" ? params.next : "";
  const next = isSitePath(requestedNext) && !requestedNext.startsWith("/welcome") ? requestedNext : "/dashboard";

  // The notification step's choices: only song leading is asked here (its email is opt-in); the rest are on the settings page.
  let leadingPreferences: CategoryPreferences[] = [];
  if (step === "notifications") {
    try {
      leadingPreferences = (await preferencesFor(viewer, notificationDeps(viewer.env))).filter((category) => category.key === "song_leading");
    } catch (error) {
      console.error("[welcome] Could not load notification settings:", error instanceof Error ? error.message : "unknown error");
    }
  }

  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <WelcomeFlow
          plan={plan}
          step={step}
          next={next}
          form={{
            initial: form.initial,
            instrumentOptions: form.instrumentOptions,
            isMusician: form.isMusician,
            show: form.show,
            required: form.status.applicable,
            normal: form.normal,
            firstName: form.firstName,
            userId: viewer.userId,
            blocked: form.status.state === "blocked",
          }}
          push={<PushDeviceSection />}
          preferences={leadingPreferences.length > 0 ? <NotificationPreferences categories={leadingPreferences} /> : null}
        />
      </Container>
    </PageTransition>
  );
}
