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
