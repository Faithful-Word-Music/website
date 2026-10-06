/**
 * The admin area's sections, and who may open each. THE ONE PLACE this is
 * written down: the admin sidebar (src/app/admin/layout.tsx) and the site
 * search (src/lib/site-search.ts) both read it, so a section can never be
 * offered in one and missing from the other.
 *
 * Each section names the permissions that open it - any one of them is
 * enough - exactly as its own page checks them (requireAnyPermission). Roles
 * are not mentioned anywhere: a person's effective permissions decide.
 * Showing a section is only a convenience; the page still checks for itself.
 *
 * A section with `children` is a GROUP. It is not a page: it leads nowhere
 * itself and opens to show its own pages (AI: Usage, Memory, Planning
 * Philosophy).
 *
 * Pure - no server-only import - so the browser can use it and it is unit
 * tested.
 */

import { adminContent } from "@/content/admin";
import { aiContent } from "@/content/ai";

import { ADMIN_PERMISSIONS, PEOPLE_PERMISSIONS, type Permission } from "./auth/permissions";

export type AdminIconName = "overview" | "requests" | "invitations" | "users" | "roles" | "configuration" | "ai";

/** One page of the admin area. */
export interface AdminPage {
  /** Its name in the search's copy (searchContent.admin), and a stable key. */
  id: AdminPageId;
  href: string;
  label: string;
  /** Holding any one of these opens it. */
  anyOf: readonly Permission[];
}

export type AdminPageId =
  | "overview"
  | "requests"
  | "invitations"
  | "users"
  | "roles"
  | "configuration"
  | "aiUsage"
  | "aiMemory"
  | "aiPhilosophy";

/** A row of the sidebar: a page, or a group of pages. */
export type AdminSection =
  | (AdminPage & { icon: AdminIconName; children?: undefined })
  | { id: string; label: string; icon: AdminIconName; children: AdminPage[] };

export interface AdminSectionGroup {
  label?: string;
  sections: AdminSection[];
}

const nav = adminContent.nav;
const ai = aiContent.admin.nav;

export const ADMIN_SECTIONS: AdminSectionGroup[] = [
  {
    sections: [{ id: "overview", href: "/admin", label: nav.items.overview, icon: "overview", anyOf: ADMIN_PERMISSIONS }],
  },
  {
    label: nav.groups.people,
    sections: [
      { id: "requests", href: "/admin/requests", label: nav.items.requests, icon: "requests", anyOf: ["manage_users"] },
      { id: "invitations", href: "/admin/invitations", label: nav.items.invitations, icon: "invitations", anyOf: ["manage_users"] },
      { id: "users", href: "/admin/users", label: nav.items.users, icon: "users", anyOf: PEOPLE_PERMISSIONS },
      { id: "roles", href: "/admin/roles", label: nav.items.roles, icon: "roles", anyOf: ["manage_roles"] },
    ],
  },
  {
    label: nav.groups.setup,
    sections: [
      {
        id: "configuration",
        href: "/admin/configuration",
        label: nav.items.configuration,
        icon: "configuration",
        anyOf: ["manage_profiles", "manage_sheet_music"],
      },
      {
        id: "ai",
        label: nav.items.ai,
        icon: "ai",
        children: [
          { id: "aiUsage", href: "/admin/ai", label: ai.usage, anyOf: ["use_ai"] },
          // What may be CHANGED on these two has permissions of its own, checked on the pages; opening them needs only use_ai.
          { id: "aiMemory", href: "/admin/ai/memory", label: ai.memory, anyOf: ["use_ai"] },
          { id: "aiPhilosophy", href: "/admin/ai/philosophy", label: ai.philosophy, anyOf: ["use_ai"] },
        ],
      },
    ],
  },
];

const may = (permissions: ReadonlySet<Permission>, page: Pick<AdminPage, "anyOf">) =>
  page.anyOf.some((permission) => permissions.has(permission));

/**
 * The sections one person may open, grouped as the sidebar shows them. A
 * group keeps only the pages they may open and is dropped when none is left;
 * so is a heading with nothing under it.
 */
export function adminSectionsFor(permissions: ReadonlySet<Permission>): AdminSectionGroup[] {
  return ADMIN_SECTIONS.map((group) => ({
    ...group,
    sections: group.sections.flatMap((section): AdminSection[] => {
      if (!section.children) return may(permissions, section) ? [section] : [];
      const children = section.children.filter((page) => may(permissions, page));
      return children.length > 0 ? [{ ...section, children }] : [];
    }),
  })).filter((group) => group.sections.length > 0);
}

/** Every admin page one person may open, in the sidebar's order - for the site search. */
export function adminPagesFor(permissions: ReadonlySet<Permission>): AdminPage[] {
  return adminSectionsFor(permissions).flatMap((group) =>
    group.sections.flatMap((section): AdminPage[] => section.children ?? [section]),
  );
}
