"use client";

import { useEffect } from "react";

import type { ConductorScreenPlan } from "@/lib/ai/conductor/context";
import type { PlanSlots } from "@/lib/service-planner/model";

/**
 * The service open in the Service Planner, as it stands on screen - saved or
 * not - for Conductor to be told about (conductor-store.ts sends it with a
 * question asked over that service's page).
 *
 * The workspace says what it shows; nothing is read off the page. It is only
 * ever looked at when a question is asked, so nothing subscribes to it.
 */
interface PlannerDraft extends ConductorScreenPlan {
  /** The service's anchor: "2026-10-11-am". */
  anchor: string;
}

let current: PlannerDraft | null = null;

/** The planner's workspace, keeping Conductor's view of it up to date while it is open. */
export function usePlannerDraft(anchor: string, slots: PlanSlots, unsaved: boolean) {
  useEffect(() => {
    const draft = { anchor, slots, unsaved };
    current = draft;
    return () => {
      // The workspace that replaces this one (after a save) has already said what it shows.
      if (current === draft) current = null;
    };
  }, [anchor, slots, unsaved]);
}

/** What the planner has on screen for the service at `anchor`, when that is the one open. */
export function plannerDraftFor(anchor: string | undefined): ConductorScreenPlan | null {
  return current && current.anchor === anchor ? { slots: current.slots, unsaved: current.unsaved } : null;
}
