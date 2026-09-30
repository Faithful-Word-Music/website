/**
 * The page's real path, from the one Next.js reports.
 *
 * When Vercel regenerates the home page in the background (ISR), Next.js
 * renders the root route as "/index" - and usePathname() returns "/index" in
 * that cached HTML and after it hydrates. Nothing on the site lives at
 * "/index", so it is always the home page.
 */
export function normalizePath(pathname: string): string {
  if (pathname === "/index" || pathname === "/index/") return "/";
  return pathname.replace(/\/index\/?$/, "") || "/";
}
