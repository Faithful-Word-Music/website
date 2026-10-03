"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { createRoleAction, updateRoleAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PERMISSIONS, PERMISSION_GROUPS, type Permission } from "@/lib/auth/permissions";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

/**
 * Create a role, or edit one: its name, description and permissions. A
 * permission the viewer does not hold cannot be switched on (the server
 * refuses it too).
 */
export function RoleForm({
  roleKey,
  initial,
  grantable,
  locked = false,
}: {
  /** Absent when creating. */
  roleKey?: string;
  initial: { label: string; description: string; permissions: string[] };
  grantable: string[];
  /** The Administrator role: always every permission, so only its wording can change. */
  locked?: boolean;
}) {
  const ids = useId();
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [description, setDescription] = useState(initial.description);
  const [permissions, setPermissions] = useState<string[]>(initial.permissions);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  function toggle(permission: string) {
    setPermissions((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission],
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const input = { label, description, permissions };
      if (roleKey) {
        const outcome = await updateRoleAction(roleKey, input);
        setResult(outcome);
        if (outcome.ok) router.refresh();
      } else {
        const outcome = await createRoleAction(input);
        setResult(outcome);
        if (outcome.ok) router.push(`/admin/roles/${outcome.value}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id={`${ids}-label`}
          label="Name"
          value={label}
          maxLength={PROFILE_LIMITS.roleLabel}
          onChange={setLabel}
        />
        <TextField
          id={`${ids}-description`}
          label="Description"
          hint="Optional"
          value={description}
          maxLength={PROFILE_LIMITS.roleDescription}
          onChange={setDescription}
        />
      </div>

      <fieldset className="space-y-5">
        <legend className="text-sm font-medium text-ink">Permissions</legend>
        {locked ? <p className="text-sm text-muted">Administrators always have every permission.</p> : null}
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.key}>
            <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
              {group.label}
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(PERMISSIONS) as Permission[])
                .filter((key) => PERMISSIONS[key].group === group.key)
                .map((key) => {
                  const checked = locked || permissions.includes(key);
                  const enabled = !locked && (grantable.includes(key) || checked);
                  return (
                    <li key={key}>
                      <label
                        className={cn(
                          "flex items-start gap-3 rounded-lg border border-line px-3 py-2.5",
                          enabled ? "cursor-pointer hover:border-gold" : "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!enabled}
                          onChange={() => toggle(key)}
                          className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
                        />
                        <span>
                          <span className="block text-sm text-ink">{PERMISSIONS[key].label}</span>
                          <span className="block text-xs text-muted">{PERMISSIONS[key].description}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </fieldset>

      {locked ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : roleKey ? "Save role" : "Create role"}
          </Button>
          <ActionMessage result={result} />
        </div>
      )}
    </form>
  );
}
