import { describe, expect, it } from "vitest";

import { onboardingPlan, STARTED } from "./onboarding";
import { applicableRequirements, type Participation, type RequirementKey } from "./profile-requirements";

const musician: Participation = { musician: true, songLeader: false, availability: true };
const leader: Participation = { musician: false, songLeader: true, availability: true };
const member: Participation = { musician: false, songLeader: false, availability: false };

function status(who: Participation, missing: RequirementKey[]) {
  return { participation: who, applicable: applicableRequirements(who), missing: missing.map((key) => ({ key, dueAt: null })) };
}

const everything = (who: Participation) => applicableRequirements(who);

describe("onboarding", () => {
  it("walks a new song leader through every step that applies, never instruments", () => {
    const plan = onboardingPlan({ status: status(leader, everything(leader)), progress: new Set([STARTED]) });
    expect(plan.mode).toBe("full");
    expect(plan.steps.map((step) => step.key)).toEqual(["about", "ministry", "availability", "notifications", "intro"]);
    expect(plan.current).toBe("about");
    expect(plan.steps.find((step) => step.key === "ministry")?.missing).not.toContain("instruments");
  });

  it("leaves the ministry and availability steps out for a Member-only account", () => {
    const plan = onboardingPlan({ status: status(member, ["name"]), progress: new Set([STARTED]) });
    expect(plan.steps.map((step) => step.key)).toEqual(["about", "notifications", "intro"]);
  });

  it("resumes where it was left: saved answers and seen steps carry over", () => {
    const progress = new Set([STARTED, "about"]);
    const missing: RequirementKey[] = ["leading_experience", "leading_unfamiliar", "leading_unaccompanied", "availability_reviewed"];
    const plan = onboardingPlan({ status: status(leader, missing), progress });
    expect(plan.current).toBe("ministry");
    expect(plan.steps.find((step) => step.key === "about")?.done).toBe(true);
  });

  it("never counts a required step as done because it was clicked past", () => {
    const progress = new Set([STARTED, "about", "ministry"]);
    const plan = onboardingPlan({ status: status(musician, ["instruments"]), progress });
    expect(plan.steps.find((step) => step.key === "ministry")?.done).toBe(false);
    expect(plan.current).toBe("ministry");
    expect(plan.requiredDone).toBe(false);
  });

  it("lets optional steps be skipped, and finishes once they have been", () => {
    const progress = new Set([STARTED, "about", "ministry", "notifications"]);
    const plan = onboardingPlan({ status: status(musician, []), progress });
    expect(plan.requiredDone).toBe(true);
    expect(plan.current).toBe("intro");
    const finished = onboardingPlan({ status: status(musician, []), progress: new Set([...progress, "intro"]) });
    expect(finished.mode).toBe("done");
  });

  it("shows an existing member only what is missing, without replaying the rest", () => {
    const plan = onboardingPlan({ status: status(musician, ["availability_reviewed"]), progress: new Set() });
    expect(plan.mode).toBe("focused");
    expect(plan.steps.map((step) => step.key)).toEqual(["availability"]);
  });

  it("offers someone who becomes a song leader only the song-leading questions", () => {
    const both: Participation = { musician: true, songLeader: true, availability: true };
    const plan = onboardingPlan({
      status: status(both, ["leading_experience", "leading_unfamiliar", "leading_unaccompanied"]),
      progress: new Set([STARTED, "about", "ministry", "notifications", "intro"]),
    });
    expect(plan.mode).toBe("focused");
    expect(plan.steps.map((step) => step.key)).toEqual(["ministry"]);
  });

  it("is done for a complete member with no walkthrough open (the same on every device)", () => {
    expect(onboardingPlan({ status: status(musician, []), progress: new Set() })).toEqual({
      mode: "done",
      steps: [],
      current: null,
      requiredDone: true,
    });
  });

  it("replaying the introduction reopens the walkthrough without asking saved questions again", () => {
    const plan = onboardingPlan({ status: status(musician, []), progress: new Set([STARTED, "about", "ministry"]) });
    expect(plan.mode).toBe("full");
    expect(plan.current).toBe("notifications");
    expect(plan.steps.filter((step) => !step.done).map((step) => step.key)).toEqual(["notifications", "intro"]);
  });
});
