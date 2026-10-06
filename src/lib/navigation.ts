/**
 * Which links the header, mobile menu, footer and account menu show - for
 * visitors, and for each signed-in person. THE ONE PLACE this is decided.
 *
 *   Signed out:  the public site's navigation (siteConfig.nav).
 *   Signed in:   the Dashboard replaces Home - signed-in people never see the
 *                public home page (the proxy sends "/" to "/dashboard") - and
 *                the public music pages stay.
 *
 * A signed-in destination (the Service Planner, Availability) is one entry
 * in APP_NAV with the permission that opens it. Showing a link is only
 * a convenience: the page itself must still check that permission on the
 * server (src/lib/auth/session.ts).
 *
 * The working tools (the Service Planner, Conductor) share one "Tools" menu,
 * so the bar does not grow a link for each. A person who may open only one
 * of them sees that one as a plain link - never a menu of one.
 *
 * Pure - no server-only import - so the browser can use it and it can be
 * unit tested.
 */

import { siteConfig } from "@/config/site";
import { navigationContent } from "@/content/navigation";

import { canAccessAdmin, type Permission } from "./auth/permissions";

export interface NavItem {
  label: string;
  /** Where it leads. For a menu, its first link - so anything that treats it as a link still works. */
  href: string;
  /** Set on a menu ("Tools"): the links inside it, always two or more. */
  children?: NavItem[];
}

export interface NavContext {
  signedIn: boolean;
  /** The signed-in person's own permissions, or empty until known. */
  permissions: ReadonlySet<Permission>;
}

interface NavEntry {
  label: string;
  /** Left out on a menu, which leads nowhere itself. */
  href?: string;
  /** Shown only to someone holding this permission. */
  permission?: Permission;
  /** Shown only when this returns true (for rules a single permission cannot express). */
  when?: (context: NavContext) => boolean;
  /** A menu's links, each with its own permission. */
  children?: NavEntry[];
}

export const SIGNED_OUT: NavContext = { signedIn: false, permissions: new Set() };

/** Where "home" is: the logo's link. */
export function homeHref(context: NavContext): string {
  return context.signedIn ? "/dashboard" : "/";
}

/** A public page's entry, by its address. */
function publicPage(href: string): NavEntry {
  const item = siteConfig.nav.find((entry) => entry.href === href)!;
  return { label: item.label, href: item.href };
}

/**
 * The signed-in primary navigation, in order: the Dashboard in Home's place,
 * then the tools the song list is built with, where it is read, and the
 * rest. Each application page carries the permission that opens it.
 */
const APP_NAV: NavEntry[] = [
  { label: navigationContent.dashboard, href: "/dashboard" },
  {
    label: navigationContent.tools,
    children: [
      // The Music Director's - drafts and long-range plans are nobody else's business.
      { label: navigationContent.servicePlanner, href: "/service-planner", permission: "manage_service_plans" },
      // The AI assistant: every question is paid for.
      { label: navigationContent.conductor, href: "/conductor", permission: "use_ai" },
    ],
  },
  publicPage("/song-list"),
  publicPage("/library"),
  // The music ministry's participants only - never a Member-only account.
  { label: navigationContent.availability, href: "/availability", permission: "view_availability" },
  publicPage("/contact"),
];

/** The account menu (the avatar in the header), in order. Log out follows it. */
const ACCOUNT_MENU: NavEntry[] = [
  // No Dashboard here: it already leads the main navigation, and the logo goes to it.
  { label: navigationContent.notifications, href: "/notifications" },
  { label: navigationContent.profile, href: "/profile" },
  { label: navigationContent.accountSettings, href: "/account" },
  { label: navigationContent.admin, href: "/admin", when: (context) => canAccessAdmin(context.permissions) },
];

function allowed(entries: NavEntry[], context: NavContext): NavItem[] {
  return entries
    .filter((entry) => !entry.permission || context.permissions.has(entry.permission))
    .filter((entry) => !entry.when || entry.when(context))
    .flatMap((entry): NavItem[] => {
      if (!entry.children) return entry.href ? [{ label: entry.label, href: entry.href }] : [];
      // A menu with nothing in it is not shown, and one link needs no menu.
      const children = allowed(entry.children, context);
      if (children.length < 2) return children;
      return [{ label: entry.label, href: children[0].href, children }];
    });
}

/**
 * The main navigation, as the header and the mobile menu show it: links, and
 * menus of links (an item with `children`).
 */
export function primaryNav(context: NavContext): NavItem[] {
  if (!context.signedIn) return siteConfig.nav.map(({ label, href }) => ({ label, href }));
  return allowed(APP_NAV, context);
}

/** The same links with each menu opened out in place, for a plain list (the footer). */
export function flatNav(items: readonly NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children ? flatNav(item.children) : [{ label: item.label, href: item.href }]));
}

/** The account menu's links. Empty for visitors. */
export function accountMenu(context: NavContext): NavItem[] {
  if (!context.signedIn) return [];
  return allowed(ACCOUNT_MENU, context);
}

/** The pages only a signed-in person can reach (the proxy sends anyone else to /login). */
const MEMBER_SECTIONS = ["/dashboard", "/service-planner", "/conductor", "/availability", "/notifications", "/profile", "/account", "/admin"];

/**
 * Whether this page can only be open to someone signed in. While Clerk is
 * still loading in the browser, the navigation can then show the signed-in
 * links at once instead of flashing the visitor's.
 */
export function isMemberPath(pathname: string): boolean {
  return MEMBER_SECTIONS.some((section) => isActivePath(pathname, section));
}

/** Whether a nav link is the page being shown (or a page inside it). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
