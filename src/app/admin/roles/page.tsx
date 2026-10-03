import Link from "next/link";

import { NoAccess } from "@/components/account/Notices";
import { RoleForm } from "@/components/admin/RoleForm";
import { Pill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ADMIN_ROLE, ALL_PERMISSIONS, MEMBER_ROLE } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { listRoles } from "@/lib/auth/store";

export const metadata = { title: "Roles" };

/** /admin/roles - every role, what it allows and who holds it; and a form to create a new one. */
export default async function RolesPage() {
  const viewer = await requireAnyPermission("/admin/roles", ["manage_roles"]);
  if (!viewer) return <NoAccess />;

  const roles = await listRoles(viewer.env);

  return (
    <div className="space-y-12">
      <div>
        <SectionHeading as="h1" title="Roles">
          <p className="text-base">
            A role is a set of permissions. People can hold several roles and get every permission from each. For a
            one-off difference, add an exception on the person&apos;s page instead.
          </p>
        </SectionHeading>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map((role) => {
            const count = role.key === ADMIN_ROLE ? ALL_PERMISSIONS.length : role.permissions.length;
            const holders =
              role.key === MEMBER_ROLE
                ? "everyone"
                : `${role.memberCount} ${role.memberCount === 1 ? "person" : "people"}`;
            return (
              <Link key={role.key} href={`/admin/roles/${role.key}`} className="group">
                <Card className="h-full p-6 transition-shadow group-hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-xl text-ink">{role.label}</p>
                    {role.isSystem ? <Pill tone="muted">Built in</Pill> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{role.description}</p>
                  <p className="mt-4 text-xs text-muted">
                    {count} permissions · {holders}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <h2 className="font-display text-2xl text-ink">New role</h2>
        <div className="mt-6">
          <RoleForm initial={{ label: "", description: "", permissions: [] }} grantable={[...viewer.permissions]} />
        </div>
      </Card>
    </div>
  );
}
