import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { AdminSidebar, type AdminNavGroup } from "@/components/admin/AdminSidebar";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { adminContent } from "@/content/admin";
import { aiContent } from "@/content/ai";
import { PEOPLE_PERMISSIONS } from "@/lib/auth/permissions";
import { requireViewer } from "@/lib/auth/session";
import { countRequestsByStatus } from "@/lib/auth/store";

const copy = adminContent.nav;
const aiNav = aiContent.admin.nav;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Faithful Word Music" },
  robots: { index: false, follow: false },
};

/**
 * The admin area's frame: a sidebar of whatever sections the person may use.
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
  const groups: AdminNavGroup[] = [
    { items: [{ href: "/admin", label: copy.items.overview, icon: "overview" as const, show: true }] },
    {
      label: copy.groups.people,
      items: [
        {
          href: "/admin/requests",
          label: copy.items.requests,
          icon: "requests" as const,
          show: viewer.can("manage_users"),
          badge: pending,
        },
        {
          href: "/admin/invitations",
          label: copy.items.invitations,
          icon: "invitations" as const,
          show: viewer.can("manage_users"),
        },
        {
          href: "/admin/users",
          label: copy.items.users,
          icon: "users" as const,
          show: PEOPLE_PERMISSIONS.some((permission) => viewer.can(permission)),
        },
        { href: "/admin/roles", label: copy.items.roles, icon: "roles" as const, show: viewer.can("manage_roles") },
      ],
    },
    {
      label: copy.groups.setup,
      items: [
        {
          href: "/admin/configuration",
          label: copy.items.configuration,
          icon: "configuration" as const,
          show: viewer.can("manage_profiles") || viewer.can("manage_sheet_music"),
        },
        {
          href: "/admin/ai",
          label: copy.items.ai,
          icon: "ai" as const,
          show: viewer.can("use_ai"),
          children: [
            { href: "/admin/ai", label: aiNav.usage },
            { href: "/admin/ai/memory", label: aiNav.memory },
            { href: "/admin/ai/philosophy", label: aiNav.philosophy },
          ],
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.show),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Container size="wide" className="pb-14 pt-8 sm:pb-20 sm:pt-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <RehearsalMark className="mb-4">{copy.label}</RehearsalMark>
          <AdminSidebar
            groups={groups}
            note={viewer.env === "development" ? copy.developmentNote : undefined}
          />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
