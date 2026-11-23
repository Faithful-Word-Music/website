"use client";

import { useId, useState } from "react";

import { inviteAction } from "@/app/admin/actions";
import { ActionMessage, ChoiceChips, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { adminContent } from "@/content/admin";
import { feedbackContent } from "@/content/feedback";

export interface AssignableRole {
  key: string;
  label: string;
}

/**
 * Roles to give someone as soon as they accept their invitation. Shown only
 * to people allowed to hand out roles; the server checks again.
 */
export function InvitationRolePicker({
  name,
  roles,
  selected,
  onChange,
}: {
  name: string;
  roles: AssignableRole[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (roles.length === 0) return null;
  return (
    <ChoiceChips
      name={name}
      legend="Roles"
      hint="Optional - given as soon as they create their account. Everyone is a Member either way."
      options={roles.map((role) => ({ value: role.key, label: role.label }))}
      selected={selected}
      multiple
      onChange={onChange}
    />
  );
}

/** Church affiliation, decided separately from roles when inviting someone. */
export function AffiliationChoice({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const copy = adminContent.sheetAccess.affiliation;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-gold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
      />
      <span>
        <span className="block text-sm text-ink">{copy.inviteLabel}</span>
        <span className="block text-xs text-muted">{copy.inviteHint}</span>
      </span>
    </label>
  );
}

/** Invite someone directly, without an account request first. */
export function InviteForm({ roles }: { roles: AssignableRole[] }) {
  const ids = useId();
  const [email, setEmail] = useState("");
  const [chosenRoles, setChosenRoles] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  const { result, run, stateOf } = useAction();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => inviteAction(email, chosenRoles, verified), {
      onOk: () => {
        setEmail("");
        setChosenRoles([]);
        setVerified(false);
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <TextField
        id={`${ids}-email`}
        label="Email address"
        placeholder="name@example.com"
        type="email"
        value={email}
        maxLength={254}
        onChange={setEmail}
      />
      <AffiliationChoice checked={verified} onChange={setVerified} />
      <InvitationRolePicker name={`${ids}-roles`} roles={roles} selected={chosenRoles} onChange={setChosenRoles} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          state={stateOf()}
          pendingLabel={feedbackContent.sending}
          doneLabel={feedbackContent.sent}
          disabled={!email.trim()}
        >
          Send invitation
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}
