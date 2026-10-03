import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { PEOPLE_PERMISSIONS } from "@/lib/auth/permissions";
import { requireViewer } from "@/lib/auth/session";
import { countRequestsByStatus } from "@/lib/auth/store";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Faithful Word Music" },
  robots: { index: false, follow: false },
};

/**
 * The admin area's frame: section tabs for whatever the person may use.
 *
 * This is presentation only. Every admin page and every server action checks
 * permissions again for itself - a layout is not re-run on every navigation,
 * so it can never be the thing that protects a page.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireViewer("/admin");

  if (!viewer.canAccessAdmin) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }

  const pending = viewer.can("manage_users") ? (await countRequestsByStatus(viewer.env)).pending : 0;
  const items = [
    { href: "/admin", label: "Overview", show: true },
    { href: "/admin/requests", label: "Requests", show: viewer.can("manage_users"), badge: pending },
    { href: "/admin/invitations", label: "Invitations", show: viewer.can("manage_users") },
    {
      href: "/admin/users",
      label: "People",
      show: PEOPLE_PERMISSIONS.some((permission) => viewer.can(permission)),
    },
    { href: "/admin/roles", label: "Roles", show: viewer.can("manage_roles") },
    {
      href: "/admin/configuration",
      label: "Configuration",
      show: viewer.can("manage_profiles") || viewer.can("manage_sheet_music"),
    },
  ].filter((item) => item.show);

  return (
    <Container size="wide" className="pb-14 pt-8 sm:pb-20 sm:pt-10">
      <div className="flex items-center justify-between gap-4">
        <RehearsalMark className="mb-0">Admin</RehearsalMark>
        {viewer.env === "development" ? (
          <span className="text-xs text-muted">Development accounts (Clerk test instance)</span>
        ) : null}
      </div>
      <div className="mt-4">
        <AdminNav items={items} overflow="scroll" />
      </div>
      <div className="mt-8">{children}</div>
    </Container>
  );
}
