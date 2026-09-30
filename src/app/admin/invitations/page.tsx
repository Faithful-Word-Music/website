import { NoAccess, Notice } from "@/components/account/Notices";
import { ActionButton } from "@/components/admin/ActionButton";
import { InviteForm } from "@/components/admin/InviteForm";
import { Pill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { assignableRoles } from "@/lib/auth/assignable-roles";
import { listInvitations } from "@/lib/auth/clerk";
import { formatDate } from "@/lib/auth/format";
import { requireAnyPermission } from "@/lib/auth/session";
import { listRoles, pendingInvitationRoles } from "@/lib/auth/store";

import { revokeInvitationAction } from "../actions";

export const metadata = { title: "Invitations" };

/** /admin/invitations - invite someone directly, and see or withdraw invitations not yet used. */
export default async function InvitationsPage() {
  const viewer = await requireAnyPermission("/admin/invitations", ["manage_users"]);
  if (!viewer) return <NoAccess />;

  const [invitations, roles, chosenRoles, allRoles] = await Promise.all([
    listInvitations({ status: "pending" }),
    assignableRoles(viewer),
    pendingInvitationRoles(viewer.env),
    listRoles(viewer.env),
  ]);
  const roleLabel = new Map(allRoles.map((role) => [role.key, role.label]));

  return (
    <div className="max-w-3xl">
      <SectionHeading as="h1" title="Invitations">
        <p className="text-base">
          Clerk emails the invitation. The link is valid for {siteConfig.accounts.invitationDays} days and can only be
          used once.
        </p>
      </SectionHeading>

      <Card className="mt-8 p-6 sm:p-8">
        <InviteForm roles={roles} />
      </Card>

      <h2 className="mt-12 font-display text-2xl text-ink">Waiting to be accepted</h2>
      {!invitations.ok ? (
        <Notice tone="warning" title="Clerk could not be reached" className="mt-4">
          The invitations cannot be shown right now. Please try again shortly.
        </Notice>
      ) : invitations.value.length === 0 ? (
        <p className="mt-4 text-muted">No invitations are waiting.</p>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {invitations.value.map((invitation) => {
              const keys = chosenRoles.get(invitation.id) ?? [];
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink">{invitation.email}</p>
                    <p className="text-xs text-muted">Sent {formatDate(invitation.createdAt)}</p>
                    {keys.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {keys.map((key) => (
                          <Pill key={key}>{roleLabel.get(key) ?? key}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <ActionButton
                    action={revokeInvitationAction.bind(null, invitation.id)}
                    label="Revoke"
                    pendingLabel="Revoking…"
                    confirm="Withdraw this invitation?"
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
