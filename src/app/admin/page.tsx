import Link from "next/link";

import { NoAccess } from "@/components/account/Notices";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { countAccounts, listInvitations } from "@/lib/auth/clerk";
import { requireAnyPermission } from "@/lib/auth/session";
import { countRequestsByStatus, listRoles } from "@/lib/auth/store";
import { ADMIN_PERMISSIONS } from "@/lib/auth/permissions";

export const metadata = { title: "Overview" };

/** /admin - what needs attention, at a glance. */
export default async function AdminOverviewPage() {
  const viewer = await requireAnyPermission("/admin", ADMIN_PERMISSIONS);
  if (!viewer) return <NoAccess />;

  const canUsers = viewer.can("manage_users");
  const [requests, invitations, accounts, roles] = await Promise.all([
    canUsers ? countRequestsByStatus(viewer.env) : null,
    canUsers ? listInvitations({ status: "pending" }) : null,
    countAccounts(),
    viewer.can("manage_roles") ? listRoles(viewer.env) : null,
  ]);

  const tiles = [
    requests && {
      href: "/admin/requests?status=pending",
      value: requests.pending,
      label: requests.pending === 1 ? "request waiting" : "requests waiting",
    },
    invitations && {
      href: "/admin/invitations",
      value: invitations.ok ? invitations.value.length : "–",
      label: "pending invitations",
    },
    { href: "/admin/users", value: accounts.ok ? accounts.value : "–", label: "accounts" },
    roles && { href: "/admin/roles", value: roles.length, label: "roles" },
  ].filter((tile) => !!tile);

  return (
    <div>
      <SectionHeading as="h1" title="Overview" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="group">
            <Card className="h-full p-6 transition-shadow group-hover:shadow-lift">
              <p className="font-display text-4xl text-ink">{tile.value}</p>
              <p className="mt-1 text-sm text-muted">{tile.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      {!accounts.ok ? (
        <p className="mt-6 text-sm text-gold-dark">Clerk could not be reached, so some numbers are missing.</p>
      ) : null}
    </div>
  );
}
