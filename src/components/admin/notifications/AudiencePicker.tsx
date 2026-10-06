"use client";

import { useMemo, useState } from "react";

import { ChoiceChips } from "@/components/account/fields";
import { notificationsContent } from "@/content/notifications";
import { MEMBER_ROLE } from "@/lib/auth/permissions";
import { MANUAL_AUDIENCES, MANUAL_LIMITS, type AudienceSelection } from "@/lib/notifications/manual";
import type { ComposerOptions } from "@/lib/notifications/manual-service";
import { plural } from "@/lib/plural";

const copy = notificationsContent.center;
const text = copy.compose;

/** How many people a search shows at once. */
const SHOWN = 8;

const NAMED = MANUAL_AUDIENCES.map((key) => ({ value: key, label: copy.audiences[key].label }));

/**
 * Who a notification is for: any mix of groups, roles, instruments and
 * particular people. Choosing several means anyone in ANY of them, once.
 *
 * Roles and instruments are the site's own lists as they are now - a role an
 * administrator made is here beside the built-in ones, and the instruments
 * are the ones under Admin -> Configuration. Nothing is worked out in the
 * browser: this only records what was chosen, and the server turns it into
 * people (manual-service.ts).
 */
export function AudiencePicker({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: ComposerOptions;
  value: AudienceSelection;
  onChange: (next: AudienceSelection) => void;
}) {
  const [query, setQuery] = useState("");

  // "Member" is everyone with an account, which Everyone already says.
  const roles = options.roles.filter((role) => role.key !== MEMBER_ROLE).map((role) => ({ value: role.key, label: role.label }));
  // An archived instrument is offered only while it is chosen, so it can be taken off.
  const instruments = options.instruments
    .filter((instrument) => !instrument.archived || value.instrumentIds.includes(instrument.id))
    .map((instrument) => ({ value: instrument.id, label: instrument.archived ? `${instrument.label} ${text.archived}` : instrument.label }));

  const chosen = value.userIds.map((userId) => options.people.find((person) => person.id === userId)).filter((person) => person !== undefined);
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return options.people.filter((person) => !value.userIds.includes(person.id) && words.every((word) => person.name.toLowerCase().includes(word)));
  }, [options.people, query, value.userIds]);
  const full = value.userIds.length >= MANUAL_LIMITS.users;

  return (
    <div className="space-y-6">
      <ChoiceChips name={`${id}-named`} legend={text.groupsLabel} options={NAMED} selected={value.named} multiple onChange={(named) => onChange({ ...value, named })} />

      {roles.length > 0 ? (
        <ChoiceChips name={`${id}-roles`} legend={text.rolesLabel} options={roles} selected={value.roles} multiple onChange={(next) => onChange({ ...value, roles: next })} />
      ) : null}

      {instruments.length > 0 ? (
        <ChoiceChips
          name={`${id}-instruments`}
          legend={text.instrumentsLabel}
          hint={text.instrumentsHint}
          options={instruments}
          selected={value.instrumentIds}
          multiple
          onChange={(instrumentIds) => onChange({ ...value, instrumentIds })}
        />
      ) : null}

      <div>
        <label htmlFor={`${id}-people`} className="mb-1.5 block text-sm font-medium text-ink">
          {text.peopleLabel}
        </label>
        {chosen.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {chosen.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, userIds: value.userIds.filter((userId) => userId !== person.id) })}
                  aria-label={text.removePerson.replace("{name}", person.name)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink bg-ink pl-4 pr-3 text-sm text-paper transition-colors hover:bg-ink-soft"
                >
                  {person.name}
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={`${id}-people`}
          type="search"
          value={query}
          placeholder={text.peopleSearch}
          autoComplete="off"
          disabled={full}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-11 w-full rounded-full border border-line bg-surface px-4 text-base text-ink placeholder:text-muted transition-colors not-disabled:hover:border-muted/50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
        />
        {query.trim() !== "" ? (
          matches.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{text.peopleNone}</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {matches.slice(0, SHOWN).map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ ...value, userIds: [...value.userIds, person.id] });
                        setQuery("");
                      }}
                      className="flex min-h-11 w-full items-center px-4 text-left text-sm text-ink transition-colors hover:bg-paper"
                    >
                      {person.name}
                    </button>
                  </li>
                ))}
              </ul>
              {matches.length > SHOWN ? <p className="mt-2 text-xs text-muted">{plural(text.peopleMore, matches.length - SHOWN)}</p> : null}
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
