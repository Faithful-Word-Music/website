import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { NoAccess, Notice } from "@/components/account/Notices";
import { ProfileView, SectionLabel } from "@/components/account/ProfileView";
import { ActionButton } from "@/components/admin/ActionButton";
import { Pill } from "@/components/admin/StatusPill";
import { OverrideEditor, RoleEditor, TitleEditor } from "@/components/admin/UserEditors";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getAccount } from "@/lib/auth/clerk";
import { formatDateTime } from "@/lib/auth/format";
import { clerkUserIdSchema } from "@/lib/auth/forms";
import { ADMIN_ROLE, MEMBER_ROLE, PERMISSIONS, PERMISSION_GROUPS, resolvePermissions } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import {
  getProfile,
  getUserInstruments,
  getUserTitles,
  listOptions,
  listOverrides,
  listRoles,
  loadAuthorization,
} from "@/lib/auth/store";

import { deleteUserAction, setBannedAction } from "../../actions";

export const metadata = { title: "Person" };

/**
 * /admin/users/[id] - one person. What is shown depends on what the viewer
 * may do: the profile needs "View profiles", roles and exceptions "Manage
 * roles", titles "Manage profiles", and disabling or deleting "Manage users".
 */
export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const viewer = await requireAnyPermission(`/admin/users/${id}`, [
    "manage_users",
    "view_profiles",
    "manage_roles",
    "manage_profiles",
  ]);
  if (!viewer) return <NoAccess />;

  const userId = clerkUserIdSchema.safeParse(id);
  if (!userId.success) notFound();
  const account = await getAccount(userId.data);
  if (!account.ok) {
    if (account.reason === "not-found") notFound();
    return (
      <Notice tone="warning" title="Clerk could not be reached">
        This account cannot be shown right now. Please try again shortly.
      </Notice>
    );
  }
  const person = account.value;
  const isSelf = person.id === viewer.userId;

  const [authorization, overrides, roles, profile, instruments, titles, titleOptions] = await Promise.all([
    loadAuthorization(viewer.env, person.id),
    listOverrides(viewer.env, person.id),
    listRoles(viewer.env),
    getProfile(viewer.env, person.id),
    getUserInstruments(viewer.env, person.id),
    getUserTitles(viewer.env, person.id),
    listOptions(viewer.env, "titles"),
  ]);
  const effective = resolvePermissions(authorization.roleKeys, authorization.rolePermissions, overrides);
  const roleLabels = roles
    .filter((role) => authorization.roleKeys.includes(role.key) || role.key === MEMBER_ROLE)
    .map((role) => role.label);
  const isTargetAdmin = authorization.roleKeys.includes(ADMIN_ROLE);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm">
          <Link href="/admin/users" className="text-muted transition-colors hover:text-ink">
            ← All people
          </Link>
        </p>
        <SectionHeading as="h1" title={person.fullName} className="mt-4">
          <p className="flex flex-wrap items-center gap-2 text-base">
            {person.email}
            {person.banned ? <Pill tone="warning">Disabled</Pill> : null}
            {isSelf ? <Pill>You</Pill> : null}
          </p>
        </SectionHeading>
      </div>

      {viewer.can("view_profiles") ? (
        <ProfileView
          person={person}
          profile={profile}
          instruments={instruments}
          titles={titles}
          roleKeys={authorization.roleKeys}
          roleLabels={roleLabels}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {viewer.can("manage_roles") ? (
          <Section title="Roles" description="What this person may do on the site. Their permissions add up across roles.">
            <RoleEditor
              userId={person.id}
              roles={roles.map(({ key, label, description }) => ({ key, label, description }))}
              assigned={authorization.roleKeys}
              isSelf={isSelf}
              canEditSelf={viewer.roleKeys.includes(ADMIN_ROLE)}
            />
          </Section>
        ) : null}

        {viewer.can("manage_profiles") ? (
          <Section title="Titles" description="Their position in the music ministry, shown on their profile.">
            <TitleEditor
              userId={person.id}
              titles={titleOptions.map(({ id: optionId, label, archived }) => ({ id: optionId, label, archived }))}
              assigned={titles.map(({ titleId, isPrimary }) => ({ titleId, isPrimary }))}
            />
          </Section>
        ) : null}

        {viewer.can("manage_roles") ? (
          <Section
            title="Exceptions"
            description="Give or take away a single permission for this person only, on top of their roles."
          >
            <OverrideEditor
              userId={person.id}
              overrides={overrides.map(({ permission, effect, note }) => ({ permission, effect, note }))}
              isSelf={isSelf}
            />
          </Section>
        ) : null}

        {viewer.can("manage_roles") ? (
          <Section title="Effective permissions" description="Everything this person can do, after roles and exceptions.">
            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => {
                const granted = (Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>).filter(
                  (key) => PERMISSIONS[key].group === group.key && effective.has(key),
                );
                return (
                  <div key={group.key}>
                    <p className="text-xs text-muted">{group.label}</p>
                    <p className="mt-1 text-sm text-ink">
                      {granted.length > 0 ? granted.map((key) => PERMISSIONS[key].label).join(", ") : "None"}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}

        {viewer.can("manage_users") ? (
          <Section title="Account" description="Sign-in details are managed by Clerk.">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Created</dt>
                <dd className="text-ink">{formatDateTime(person.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Last signed in</dt>
                <dd className="text-ink">{person.lastSignInAt ? formatDateTime(person.lastSignInAt) : "Never"}</dd>
              </div>
            </dl>
            {isSelf ? (
              <p className="mt-6 text-sm text-muted">You cannot disable or delete your own account here.</p>
            ) : (
              <div className="mt-6 space-y-4 border-t border-line pt-6">
                {person.banned ? (
                  <ActionButton
                    action={setBannedAction.bind(null, person.id, false)}
                    label="Re-enable account"
                    pendingLabel="Re-enabling…"
                  />
                ) : (
                  <ActionButton
                    action={setBannedAction.bind(null, person.id, true)}
                    label="Disable account"
                    pendingLabel="Disabling…"
                    confirm="Sign them out everywhere and stop them logging in?"
                  />
                )}
                {isTargetAdmin ? (
                  <p className="text-xs text-muted">To delete this account, first remove the Administrator role.</p>
                ) : (
                  <ActionButton
                    action={deleteUserAction.bind(null, person.id)}
                    label="Delete account"
                    pendingLabel="Deleting…"
                    variant="quiet"
                    confirm="Permanently delete this account and profile? This cannot be undone."
                  />
                )}
              </div>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
