import Link from "next/link";
import { notFound } from "next/navigation";

import { NoAccess } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { ActionButton } from "@/components/admin/ActionButton";
import { feedbackContent } from "@/content/feedback";
import { RoleForm } from "@/components/admin/RoleForm";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { listAccounts } from "@/lib/auth/clerk";
import { ADMIN_ROLE, MEMBER_ROLE } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { getRole, userIdsWithRole } from "@/lib/auth/store";

import { deleteRoleAction } from "../../actions";

export const metadata = { title: "Role" };

/** /admin/roles/[key] - edit one role and see who holds it. */
export default async function RolePage({ params }: PageProps<"/admin/roles/[key]">) {
  const { key } = await params;
  const viewer = await requireAnyPermission(`/admin/roles/${key}`, ["manage_roles"]);
  if (!viewer) return <NoAccess />;

  const role = await getRole(viewer.env, key);
  if (!role) notFound();

  const memberIds = role.key === MEMBER_ROLE ? [] : await userIdsWithRole(viewer.env, role.key);
  const members =
    memberIds.length > 0 ? await listAccounts({ userIds: memberIds.slice(0, 100), limit: 100, offset: 0 }) : null;
  const deleteWarning =
    role.memberCount > 0
      ? `Delete this role? ${role.memberCount} ${role.memberCount === 1 ? "person loses" : "people lose"} it.`
      : "Delete this role?";

  return (
    <div className="space-y-8">
      <div>
        <BackLink fallback="/admin/roles" />
        <SectionHeading as="h1" title={role.label} className="mt-4">
          {role.description ? <p className="text-base">{role.description}</p> : null}
        </SectionHeading>
      </div>

      <Card className="p-6 sm:p-8">
        <RoleForm
          roleKey={role.key}
          initial={{ label: role.label, description: role.description, permissions: role.permissions }}
          grantable={[...viewer.permissions]}
          locked={role.key === ADMIN_ROLE}
        />
      </Card>

      <Card className="p-6 sm:p-8">
        <SectionLabel>Who has this role</SectionLabel>
        {role.key === MEMBER_ROLE ? (
          <p className="mt-3 text-sm text-muted">Everyone with an account.</p>
        ) : memberIds.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No one yet. Give it to people from their page under People.</p>
        ) : members?.ok ? (
          <ul className="mt-3 divide-y divide-line">
            {members.value.accounts.map((account) => (
              <li key={account.id}>
                <Link
                  href={`/admin/users/${account.id}`}
                  className="flex justify-between gap-4 py-2 text-sm transition-colors hover:text-gold-dark"
                >
                  <span className="text-ink">{account.fullName}</span>
                  <span className="truncate text-muted">{account.email}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {memberIds.length} people. Clerk could not be reached for their names.
          </p>
        )}
      </Card>

      {!role.isSystem ? (
        <ActionButton
          action={deleteRoleAction.bind(null, role.key)}
          label="Delete role"
          pendingLabel="Deleting…"
          doneToast={feedbackContent.roleDeleted}
          variant="quiet"
          confirm={deleteWarning}
        />
      ) : null}
    </div>
  );
}
