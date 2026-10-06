/**
 * Where a navigation is: which of its links the page is in, and which of its
 * groups are open. Pure - unit tested; the admin sidebar and SectionNav show
 * it.
 */

/**
 * Which of a nav's links the page is in: the longest address that matches, so
 * /admin/users/x opens People, not Overview, and a service in the planner
 * keeps Plan open.
 */
export function currentHref(items: ReadonlyArray<{ href: string }>, pathname: string): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** A group in a navigation: a row that leads nowhere itself and opens to show its own links. */
export interface NavGroup {
  id: string;
  children: ReadonlyArray<{ href: string }>;
}

/**
 * What the person last did to each group, by its id: opened or closed it, and
 * whether the page was inside it at the time.
 */
export type GroupToggles = Readonly<Record<string, { open: boolean; inside: boolean }>>;

/** Whether the page is one of a group's own. */
export function insideGroup(group: NavGroup, pathname: string): boolean {
  return currentHref(group.children, pathname) !== undefined;
}

/**
 * Whether a group is open.
 *
 *   - Left alone, it is open exactly when the page is one of its own - so
 *     arriving at /admin/ai/memory shows AI's pages, and leaving folds them.
 *   - Opened or closed by the person, it stays as they left it for as long as
 *     they stay on the same side of it: opening AI from Roles keeps it open
 *     while they look, and closing it from one of its own pages keeps it
 *     closed there. Going into the group, or out of it, starts again.
 */
export function isGroupOpen(group: NavGroup, pathname: string, toggles: GroupToggles): boolean {
  const inside = insideGroup(group, pathname);
  const toggle = toggles[group.id];
  return toggle && toggle.inside === inside ? toggle.open : inside;
}

/** `toggles` with a group turned the other way, as the person just asked. */
export function toggleGroup(group: NavGroup, pathname: string, toggles: GroupToggles): GroupToggles {
  return { ...toggles, [group.id]: { open: !isGroupOpen(group, pathname, toggles), inside: insideGroup(group, pathname) } };
}
