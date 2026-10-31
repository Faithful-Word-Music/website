"use client";

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { servicePlannerContent } from "@/content/service-planner";
import { availabilityHref } from "@/lib/availability/format";
import {
  effectiveLeaders,
  GUEST_LEADER,
  leaderConflicts,
  placeChoice,
  positionsLabel,
  summarize,
  type Leadership,
  type PlaceChoice,
} from "@/lib/leadership/model";
import { plural } from "@/lib/plural";

import { Panel } from "./Panel";

/**
 * The Service Planner's song leader controls: who leads by default, who
 * leads each song, and what needs attention. Native selects throughout - quick
 * with a keyboard, and a phone's own picker on a phone. The rules are the
 * model's (src/lib/leadership/model.ts); nothing is decided here.
 */

const copy = servicePlannerContent.leaders;

export interface LeaderPerson {
  id: string;
  name: string;
  eligible: boolean;
  available: boolean | null;
}

export type LeaderDraft = Pick<Leadership, "defaultUserId" | "overrides">;

const SELECT =
  "h-8 min-w-0 max-w-full rounded-md border border-line bg-surface px-2 text-sm transition-colors not-disabled:hover:border-muted/50 disabled:opacity-70";

function nameOf(people: readonly LeaderPerson[], id: string | null): string | null {
  if (!id) return null;
  return people.find((person) => person.id === id)?.name ?? null;
}

/** People offered in a select: everyone who may lead, and whoever is chosen now even if they can no longer. */
function options(people: readonly LeaderPerson[], chosen: string | null) {
  return people.filter((person) => person.eligible || person.id === chosen);
}

const encode = (choice: PlaceChoice) => (choice.kind === "assigned" ? `user:${choice.userId}` : choice.kind);
const decode = (value: string): PlaceChoice =>
  value.startsWith("user:") ? { kind: "assigned", userId: value.slice(5) } : value === "unassigned" ? { kind: "unassigned" } : { kind: "inherit" };

/** The service's default leader, with the one-line summary of how its songs stand. */
export function DefaultLeaderBar({
  people,
  draft,
  places,
  editable,
  onDefault,
  onClearOverrides,
}: {
  people: readonly LeaderPerson[];
  draft: LeaderDraft;
  places: readonly string[];
  editable: boolean;
  onDefault: (userId: string | null) => void;
  onClearOverrides: () => void;
}) {
  const effective = effectiveLeaders(places, draft);
  const available = (userId: string) => people.find((person) => person.id === userId)?.available ?? null;
  const eligible = (userId: string) => people.find((person) => person.id === userId)?.eligible ?? false;
  const summary = summarize(effective, available, eligible);
  const hasOverrides = places.some((placeId) => Object.hasOwn(draft.overrides, placeId));
  // Real people only: "Guest" is always offered, but is no one on the team.
  const anyone = people.some((person) => person.eligible && person.id !== GUEST_LEADER);

  const parts = [
    summary.led > 0 ? plural(copy.led as [string, string], summary.led) : null,
    summary.unled > 0 ? plural(copy.unled as [string, string], summary.unled) : null,
  ].filter(Boolean);
  const warnings = [
    summary.conflicts > 0 ? plural(copy.conflicts as [string, string], summary.conflicts) : null,
    summary.ineligible > 0 ? plural(copy.ineligible as [string, string], summary.ineligible) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3 sm:px-6">
      <label htmlFor="default-leader" className="text-sm text-muted">
        {copy.defaultLabel}
      </label>
      <select
        id="default-leader"
        value={draft.defaultUserId ? `user:${draft.defaultUserId}` : ""}
        disabled={!editable}
        onChange={(event) => onDefault(event.target.value ? event.target.value.slice(5) : null)}
        className={cn(SELECT, "font-medium text-ink")}
      >
        <option value="">{copy.noDefault}</option>
        {options(people, draft.defaultUserId).map((person) => (
          <option key={person.id} value={`user:${person.id}`}>
            {person.eligible ? person.name : copy.formerOption.replace("{name}", person.name)}
          </option>
        ))}
      </select>
      <p className="min-w-0 text-sm text-muted" aria-live="polite">
        {parts.join(" · ")}
        {warnings.length > 0 ? (
          <span className="text-gold-dark">
            {parts.length > 0 ? " · " : ""}
            {warnings.join(" · ")}
          </span>
        ) : null}
      </p>
      {editable && hasOverrides ? (
        <button
          type="button"
          onClick={onClearOverrides}
          className="ml-auto text-sm font-medium text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          {copy.clearOverrides}
        </button>
      ) : null}
      {!anyone ? <p className="basis-full text-xs text-muted">{copy.noLeaders}</p> : null}
    </div>
  );
}

/** One song's (place's) leader: follow the default, someone else, or no one - and whether they can come. */
export function PlaceLeader({
  placeId,
  position,
  people,
  draft,
  editable,
  onChoose,
}: {
  placeId: string;
  position: number;
  people: readonly LeaderPerson[];
  draft: LeaderDraft;
  editable: boolean;
  onChoose: (choice: PlaceChoice) => void;
}) {
  const choice = placeChoice(draft, placeId);
  const effective = choice.kind === "assigned" ? choice.userId : choice.kind === "unassigned" ? null : draft.defaultUserId;
  const person = effective ? people.find((item) => item.id === effective) : undefined;
  const defaultName = nameOf(people, draft.defaultUserId);
  const id = `leader-${placeId}`;
  const problem = person && !person.eligible ? copy.notEligible : person?.available === false ? copy.unavailable : null;

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0 text-muted">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3.5 13.5c.6-2.4 2.4-3.75 4.5-3.75s3.9 1.35 4.5 3.75" strokeLinecap="round" />
      </svg>
      <label htmlFor={id} className="sr-only">
        {copy.leaderFor.replace("{n}", String(position))}
      </label>
      <select
        id={id}
        value={encode(choice)}
        disabled={!editable}
        onChange={(event) => onChoose(decode(event.target.value))}
        className={cn(SELECT, "h-7 py-0 text-[0.8rem]", choice.kind === "inherit" ? "text-muted" : "font-medium text-ink")}
      >
        <option value="inherit">{defaultName ? copy.inherit.replace("{name}", defaultName) : copy.inheritNone}</option>
        {options(people, choice.kind === "assigned" ? choice.userId : null).map((item) => (
          <option key={item.id} value={`user:${item.id}`}>
            {item.eligible ? item.name : copy.formerOption.replace("{name}", item.name)}
          </option>
        ))}
        <option value="unassigned">{copy.nobody}</option>
      </select>
      {problem ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gold-dark">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
          {problem}
        </span>
      ) : null}
    </span>
  );
}

/**
 * What needs attention about the leaders, beside the songs: someone away, or
 * someone who can no longer lead - with the way to sort it out. Nothing is
 * changed for anyone here: the planner decides.
 */
export function LeadersPanel({
  people,
  draft,
  places,
  date,
  reset,
}: {
  people: readonly LeaderPerson[];
  draft: LeaderDraft;
  places: readonly string[];
  date: string;
  reset: boolean;
}) {
  const effective = effectiveLeaders(places, draft);
  const available = (userId: string) => people.find((person) => person.id === userId)?.available ?? null;
  const conflicts = leaderConflicts(effective, available);
  const ineligible = new Map<string, number[]>();
  for (const place of effective) {
    if (!place.userId || people.find((person) => person.id === place.userId)?.eligible) continue;
    ineligible.set(place.userId, [...(ineligible.get(place.userId) ?? []), place.position]);
  }
  if (!reset && conflicts.length === 0 && ineligible.size === 0) return null;
  const month = date.slice(0, 7);
  const name = (userId: string) => nameOf(people, userId) ?? "Someone";

  return (
    <Panel title={copy.title}>
      <ul className="space-y-3 text-sm">
        {reset ? <li className="text-gold-dark">{copy.reset}</li> : null}
        {conflicts.map((conflict) => (
          <li key={conflict.userId}>
            <p className="text-ink">
              {copy.conflictLine.replace("{name}", name(conflict.userId)).replace("{songs}", positionsLabel(conflict.positions))}
            </p>
            <Link
              href={availabilityHref({ month, person: conflict.userId })}
              className="mt-0.5 inline-flex text-xs font-medium text-muted underline decoration-gold underline-offset-4 transition-colors hover:text-ink"
            >
              {copy.resolve}
            </Link>
          </li>
        ))}
        {[...ineligible].map(([userId, positions]) => (
          <li key={userId} className="text-ink">
            {copy.ineligibleLine.replace("{name}", name(userId)).replace("{songs}", positionsLabel(positions))}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
