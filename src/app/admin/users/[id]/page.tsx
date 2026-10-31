import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { NoAccess, Notice } from "@/components/account/Notices";
import { ProfileView, SectionLabel } from "@/components/account/ProfileView";
import { ActionButton } from "@/components/admin/ActionButton";
import { ExtendDeadlineButton } from "@/components/admin/ProfileRequirementsPerson";
import { profileSetupContent, requirementLabel } from "@/content/profile-setup";
import { feedbackContent } from "@/content/feedback";
import { Pill } from "@/components/admin/StatusPill";
import { OverrideEditor, RoleEditor, SheetMusicTypeEditor, TitleEditor } from "@/components/admin/UserEditors";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getAccount } from "@/lib/auth/clerk";
import { formatDate, formatDateTime } from "@/lib/auth/format";
import { clerkUserIdSchema } from "@/lib/auth/forms";
import {
  ADMIN_ROLE,
  MEMBER_ROLE,
  MUSICIAN_ROLE,
  PERMISSIONS,
  PEOPLE_PERMISSIONS,
  PERMISSION_GROUPS,
  explicitPermissions,
  resolvePermissions,
} from "@/lib/auth/permissions";
import { LEAD_SONGS } from "@/lib/auth/profile-requirements";
import { evaluateProfile } from "@/lib/auth/requirements";
import { getSongLeading } from "@/lib/auth/requirements-store";
import { audienceFor, toProfileRecord, visibleProfile } from "@/lib/auth/profile-visibility";
import { PROFILE_GATE_EXEMPT, requireAnyPermission } from "@/lib/auth/session";
import {
  getProfile,
  getSheetMusicTypes,
  getUserInstruments,
  getUserTitles,
  listOptions,
  listOverrides,
  listRoles,
  listSheetMusicTypes,
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
  const viewer = await requireAnyPermission(`/admin/users/${id}`, PEOPLE_PERMISSIONS, PROFILE_GATE_EXEMPT);
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

  const managesSheetMusic = viewer.can("manage_sheet_music");
  const [authorization, overrides, roles, profile, instruments, titles, titleOptions, assignedSheetTypes, sheetTypes, leading] =
    await Promise.all([
      loadAuthorization(viewer.env, person.id),
      listOverrides(viewer.env, person.id),
      listRoles(viewer.env),
      getProfile(viewer.env, person.id),
      getUserInstruments(viewer.env, person.id),
      getUserTitles(viewer.env, person.id),
      listOptions(viewer.env, "titles"),
      getSheetMusicTypes(viewer.env, person.id),
      managesSheetMusic ? listSheetMusicTypes(viewer.env) : null,
      getSongLeading(viewer.env, person.id),
    ]);
  const effective = resolvePermissions(authorization.roleKeys, authorization.rolePermissions, overrides);
  const roleLabels = roles
    .filter((role) => authorization.roleKeys.includes(role.key) || role.key === MEMBER_ROLE)
    .map((role) => role.label);
  const isTargetAdmin = authorization.roleKeys.includes(ADMIN_ROLE);
  // The profile needs "View profiles"; the audience then decides which fields it shows.
  const audience = viewer.can("view_profiles") ? audienceFor(viewer, person.id) : null;
  const explicit = explicitPermissions(authorization.roleKeys, authorization.rolePermissions, overrides);
  const isSongLeader = explicit.has(LEAD_SONGS);
  // Looked at, never recorded: viewing someone does not start their clock.
  const requirements =
    viewer.can("manage_users") || viewer.can("view_profiles")
      ? await evaluateProfile(viewer.env, person.id, {
          roleKeys: authorization.roleKeys,
          explicit,
          account: { firstName: person.firstName, lastName: person.lastName, createdAt: person.createdAt },
          record: false,
        }).catch(() => null)
      : null;
  const requirementCopy = profileSetupContent.admin.person;

  return (
    <div className="space-y-10">
      <div>
        <BackLink fallback="/admin/users" />
        <SectionHeading as="h1" title={person.fullName} className="mt-4">
          <p className="flex flex-wrap items-center gap-2 text-base">
            {person.email}
            {person.banned ? <Pill tone="warning">Disabled</Pill> : null}
            {isSelf ? <Pill>You</Pill> : null}
          </p>
        </SectionHeading>
      </div>

      {audience ? (
        <ProfileView
          profile={visibleProfile(
            toProfileRecord(person, profile, {
              titles,
              instruments,
              roleLabels,
              songLeading: isSongLeader || Object.values(leading).some((value) => value !== null) ? leading : null,
            }),
            audience,
          )}
          isMusician={authorization.roleKeys.includes(MUSICIAN_ROLE)}
          isSongLeader={isSongLeader}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

        {viewer.can("manage_sheet_music") ? (
          <Section
            title="Sheet music"
            description="The sheet music their Dashboard gives them, in order of preference. Each song uses the first of these it has; a song with none of them shows as unavailable."
          >
            {sheetTypes ? (
              <SheetMusicTypeEditor
                userId={person.id}
                types={sheetTypes.map((type) => ({ id: type.id, label: type.label }))}
                assigned={assignedSheetTypes}
              />
            ) : null}
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

        {requirements && requirements.state !== "unknown" ? (
          <Section title={requirementCopy.title} description={profileSetupContent.admin.lead}>
            <div className="space-y-3 text-sm text-ink">
              {requirements.state === "complete" ? <p>{requirementCopy.complete}</p> : null}
              {requirements.state === "advisory" ? <p className="text-muted">{requirementCopy.notActive}</p> : null}
              {requirements.missing.length > 0 ? (
                <p>{requirementCopy.missing.replace("{items}", requirements.missing.map((item) => requirementLabel(item.key).toLowerCase()).join(", "))}</p>
              ) : null}
              {requirements.state === "grace" && requirements.dueAt ? <p>{requirementCopy.due.replace("{date}", formatDate(requirements.dueAt))}</p> : null}
              {requirements.state === "blocked" && requirements.dueAt ? (
                <p className="text-gold-dark">{requirementCopy.overdue.replace("{date}", formatDate(requirements.dueAt))}</p>
              ) : null}
              {viewer.can("manage_users") && !isSelf && (requirements.state === "grace" || requirements.state === "blocked") ? (
                <ExtendDeadlineButton userId={person.id} />
              ) : null}
            </div>
          </Section>
        ) : null}

        {viewer.can("manage_users") ? (
          <Section title="Account" description="Sign-in details are managed by Clerk.">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
                    doneToast={feedbackContent.accountDeleted}
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
