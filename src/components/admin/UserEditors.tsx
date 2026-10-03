"use client";

import { useId, useState } from "react";

import {
  removeOverrideAction,
  setOverrideAction,
  setSheetMusicTypesAction,
  setTitlesAction,
  setUserRolesAction,
} from "@/app/admin/actions";
import { ActionMessage, SelectField, TextField } from "@/components/account/fields";
import { ArrowIcon, IconButton } from "@/components/admin/OptionListEditor";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { ADMIN_ROLE, MEMBER_ROLE, PERMISSIONS, PERMISSION_GROUPS, type Permission } from "@/lib/auth/permissions";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";

const words = feedbackContent;

/**
 * Tick a role to give it, untick to take it away, then save - nothing changes
 * until Save roles is pressed. Member is held by everyone and cannot be removed.
 */
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
  const { pending, result, run, stateOf } = useAction();
  const [chosen, setChosen] = useState<string[]>(assigned);

  const changes = roles
    .filter((role) => role.key !== MEMBER_ROLE && chosen.includes(role.key) !== assigned.includes(role.key))
    .map((role) => ({ roleKey: role.key, assigned: chosen.includes(role.key) }));
  const editable = !isSelf || canEditSelf;

  function toggle(key: string) {
    setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {roles.map((role) => {
          const isMember = role.key === MEMBER_ROLE;
          const checked = isMember || chosen.includes(role.key);
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
                  onChange={() => toggle(role.key)}
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
      {editable ? (
        <Button
          type="button"
          state={stateOf()}
          pendingLabel={words.saving}
          doneLabel={words.saved}
          disabled={changes.length === 0}
          onClick={() => run(() => setUserRolesAction(userId, changes))}
        >
          Save roles
        </Button>
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
  const { pending, result, run, stateOf } = useAction();
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
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
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
                  state={stateOf(override.permission)}
                  pendingLabel={words.removing}
                  doneLabel={words.removed}
                  disabled={pending}
                  onClick={() => run(() => removeOverrideAction(userId, override.permission), { key: override.permission })}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
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
            state={stateOf()}
            pendingLabel={words.saving}
            doneLabel={words.saved}
            disabled={pending}
            onClick={() => run(() => setOverrideAction(userId, { permission, effect, note }), { onOk: () => setNote("") })}
          >
            Save exception
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">You cannot change your own permissions. Another administrator can.</p>
      )}
      <ActionMessage result={result} />
    </div>
  );
}

/**
 * The types of sheet music a person is given, in order of preference: each
 * song uses the first of them it has. Add, reorder and remove, then save -
 * nothing changes until Save sheet music is pressed.
 */
export function SheetMusicTypeEditor({
  userId,
  types,
  assigned,
}: {
  userId: string;
  /** The types offered, in their configured order. */
  types: Array<{ id: number; label: string }>;
  /** The ids of the types they have, in their order of preference. */
  assigned: number[];
}) {
  const ids = useId();
  const { pending, result, run, stateOf } = useAction();
  const labelOf = new Map(types.map((type) => [type.id, type.label]));
  const saved = assigned.filter((id) => labelOf.has(id));
  const [chosen, setChosen] = useState<number[]>(saved);
  const remaining = types.filter((type) => !chosen.includes(type.id));
  const [adding, setAdding] = useState("");
  const toAdd = remaining.some((type) => String(type.id) === adding) ? adding : String(remaining[0]?.id ?? "");
  const changed = chosen.length !== saved.length || chosen.some((id, index) => id !== saved[index]);

  function move(index: number, by: -1 | 1) {
    setChosen((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {chosen.length > 0 ? (
        <ol className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {chosen.map((id, index) => {
            const label = labelOf.get(id) ?? "";
            return (
              <li key={id} className="flex items-center gap-3 py-1.5 pl-4 pr-1.5">
                <span className="tnum w-4 shrink-0 text-sm text-gold-dark">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs text-muted">
                    {index === 0 ? "First choice" : "When a song has none of the above"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center">
                  {chosen.length > 1 ? (
                    <>
                      <IconButton label={`Move ${label} up`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                        <ArrowIcon direction="up" />
                      </IconButton>
                      <IconButton
                        label={`Move ${label} down`}
                        disabled={pending || index === chosen.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowIcon direction="down" />
                      </IconButton>
                    </>
                  ) : null}
                  <IconButton
                    label={`Remove ${label}`}
                    disabled={pending}
                    onClick={() => setChosen((current) => current.filter((item) => item !== id))}
                  >
                    <RemoveIcon />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">None - no sheet music on their Dashboard.</p>
      )}

      {remaining.length > 0 ? (
        <div className="flex gap-2">
          <SelectField
            id={`${ids}-add`}
            label={chosen.length === 0 ? "Sheet music type" : "Another sheet music type, if a song has none of these"}
            value={toAdd}
            options={remaining.map((type) => ({ value: String(type.id), label: type.label }))}
            onChange={setAdding}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setChosen((current) => [...current, Number(toAdd)])}
          >
            {chosen.length === 0 ? "Add" : "Add next"}
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        state={stateOf()}
        pendingLabel={words.saving}
        doneLabel={words.saved}
        disabled={!changed}
        onClick={() => run(() => setSheetMusicTypesAction(userId, chosen))}
      >
        Save sheet music
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
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
  const { result, run, stateOf } = useAction();
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
        <p className="text-sm text-muted">There are no titles yet. Add some under Configuration.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
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
      <Button
        type="button"
        state={stateOf()}
        pendingLabel={words.saving}
        doneLabel={words.saved}
        onClick={() => run(() => setTitlesAction(userId, chosen, primary))}
      >
        Save titles
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}
