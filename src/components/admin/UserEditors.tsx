"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { removeOverrideAction, setOverrideAction, setTitlesAction, setUserRoleAction } from "@/app/admin/actions";
import { ActionMessage, SelectField, TextField } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ADMIN_ROLE, MEMBER_ROLE, PERMISSIONS, PERMISSION_GROUPS, type Permission } from "@/lib/auth/permissions";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  function run(action: () => Promise<ActionResult<unknown>>, onOk?: () => void) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }
  return { pending, result, run };
}

/** Tick a role to give it, untick to take it away. Member is held by everyone and cannot be removed. */
export function RoleEditor({
  userId,
  roles,
  assigned,
  isSelf,
  canEditSelf,
}: {
  userId: string;
  roles: Array<{ key: string; label: string; description: string }>;
  assigned: string[];
  isSelf: boolean;
  /** Administrators may change their own roles, except Administrator itself. */
  canEditSelf: boolean;
}) {
  const { pending, result, run } = useAction();

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-card border border-line">
        {roles.map((role) => {
          const isMember = role.key === MEMBER_ROLE;
          const checked = isMember || assigned.includes(role.key);
          const locked = isMember || (isSelf && (!canEditSelf || role.key === ADMIN_ROLE));
          return (
            <li key={role.key}>
              <label
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  locked ? "cursor-default" : "cursor-pointer hover:bg-paper",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked || pending}
                  onChange={() => run(() => setUserRoleAction(userId, role.key, !checked))}
                  className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {role.label}
                    {role.key === ADMIN_ROLE ? <span className="ml-2 text-xs font-normal text-gold-dark">All permissions</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {isMember ? "Everyone with an account." : role.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {isSelf ? (
        <p className="text-xs text-muted">
          {canEditSelf
            ? "You can add roles to yourself, but not remove your own Administrator role."
            : "You cannot change your own roles. An administrator can."}
        </p>
      ) : null}
      <ActionMessage result={result} />
    </div>
  );
}

/**
 * Individual exceptions: give this person one permission their roles do not
 * include, or take away one they do.
 */
export function OverrideEditor({
  userId,
  overrides,
  isSelf,
}: {
  userId: string;
  overrides: Array<{ permission: string; effect: "grant" | "deny"; note: string }>;
  isSelf: boolean;
}) {
  const ids = useId();
  const { pending, result, run } = useAction();
  const [permission, setPermission] = useState<Permission>("view_service_plans");
  const [effect, setEffect] = useState<"grant" | "deny">("grant");
  const [note, setNote] = useState("");

  const permissionOptions = PERMISSION_GROUPS.flatMap((group) =>
    (Object.keys(PERMISSIONS) as Permission[])
      .filter((key) => PERMISSIONS[key].group === group.key)
      .map((key) => ({ value: key, label: `${group.label}: ${PERMISSIONS[key].label}` })),
  );

  return (
    <div className="space-y-4">
      {overrides.length > 0 ? (
        <ul className="divide-y divide-line rounded-card border border-line">
          {overrides.map((override) => (
            <li key={override.permission} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  <Pill tone={override.effect === "grant" ? "neutral" : "warning"}>
                    {override.effect === "grant" ? "Granted" : "Denied"}
                  </Pill>{" "}
                  {PERMISSIONS[override.permission as Permission]?.label ?? override.permission}
                </p>
                {override.note ? <p className="mt-1 text-xs text-muted">{override.note}</p> : null}
              </div>
              {!isSelf ? (
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending}
                  onClick={() => run(() => removeOverrideAction(userId, override.permission))}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No exceptions. Their permissions come from their roles alone.</p>
      )}

      {!isSelf ? (
        <div className="space-y-3 rounded-card border border-line p-4">
          <p className="text-sm font-medium text-ink">Add an exception</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <SelectField id={`${ids}-perm`} label="Permission" value={permission} options={permissionOptions} onChange={setPermission} />
            <SelectField
              id={`${ids}-effect`}
              label="Grant or deny"
              value={effect}
              options={[
                { value: "grant", label: "Grant" },
                { value: "deny", label: "Deny" },
              ]}
              onChange={setEffect}
            />
          </div>
          <TextField
            id={`${ids}-note`}
            label="Reason"
            hint="Optional"
            value={note}
            maxLength={PROFILE_LIMITS.overrideNote}
            onChange={setNote}
          />
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => setOverrideAction(userId, { permission, effect, note }), () => setNote(""))}
          >
            {pending ? "Saving…" : "Save exception"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">You cannot change your own permissions. Another administrator can.</p>
      )}
      <ActionMessage result={result} />
    </div>
  );
}

/** The titles an administrator assigns (Pianist, Organist, ...), with one marked as primary. */
export function TitleEditor({
  userId,
  titles,
  assigned,
}: {
  userId: string;
  titles: Array<{ id: number; label: string; archived: boolean }>;
  assigned: Array<{ titleId: number; isPrimary: boolean }>;
}) {
  const ids = useId();
  const { pending, result, run } = useAction();
  const [chosen, setChosen] = useState<number[]>(assigned.map((item) => item.titleId));
  const [primary, setPrimary] = useState<number | null>(
    assigned.find((item) => item.isPrimary)?.titleId ?? assigned[0]?.titleId ?? null,
  );

  const visible = titles.filter((title) => !title.archived || chosen.includes(title.id));

  function toggle(id: number) {
    const next = chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id];
    setChosen(next);
    if (primary === null || !next.includes(primary)) setPrimary(next[0] ?? null);
  }

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-sm text-muted">There are no titles yet. Add some under Titles &amp; instruments.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {visible.map((title) => {
            const checked = chosen.includes(title.id);
            return (
              <li key={title.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3 text-sm text-ink">
                  <input type="checkbox" checked={checked} onChange={() => toggle(title.id)} className="h-4 w-4 accent-[var(--color-ink)]" />
                  {title.label}
                </label>
                {checked ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                      type="radio"
                      name={`${ids}-primary`}
                      checked={primary === title.id}
                      onChange={() => setPrimary(title.id)}
                      className="accent-[var(--color-ink)]"
                    />
                    Primary
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" disabled={pending} onClick={() => run(() => setTitlesAction(userId, chosen, primary))}>
        {pending ? "Saving…" : "Save titles"}
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}
