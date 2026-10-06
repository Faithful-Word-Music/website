import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { AdminSidebar, type AdminNavGroup } from "@/components/admin/AdminSidebar";
import { Container } from "@/components/ui/Container";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { adminContent } from "@/content/admin";
import { adminSectionsFor } from "@/lib/admin-sections";
import { requireViewer } from "@/lib/auth/session";
import { countRequestsByStatus } from "@/lib/auth/store";

const copy = adminContent.nav;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Faithful Word Music" },
  robots: { index: false, follow: false },
};

/**
 * The admin area's frame: a sidebar of whatever sections the person may use.
 * Which those are is src/lib/admin-sections.ts, the same list the site search
 * reads; a section with pages of its own (AI) is a group that opens, not a
 * link (AdminSidebar).
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
  const groups: AdminNavGroup[] = adminSectionsFor(viewer.permissions).map((group) => ({
    label: group.label,
    items: group.sections.map((section) =>
      section.children
        ? { id: section.id, label: section.label, icon: section.icon, children: section.children.map(({ href, label }) => ({ href, label })) }
        : {
            href: section.href,
            label: section.label,
            icon: section.icon,
            ...(section.id === "requests" ? { badge: pending } : {}),
          },
    ),
  }));

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
