import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";

import { currentClerkConfig } from "@/lib/auth/clerk-env";

/**
 * Runs before the account routes and the home page only - the rest of the
 * public site never passes through here (see the matcher below).
 *
 * - The signed-in pages (/dashboard, /profile, /account, /admin) need a
 *   signed-in person - anyone else is sent to /login and brought back
 *   afterwards. WHAT a signed-in person may do is not decided here: every
 *   protected page and server action checks permissions itself on the server
 *   (src/lib/auth/session.ts).
 * - The home page "/" is the public front door. Signed-in people are sent to
 *   their Dashboard instead; everyone else is waved through to the same
 *   static, cached page as always. Only the redirect depends on the session -
 *   the page itself never reads it, so it stays prerendered.
 *
 * When Clerk is not configured, or configured wrongly for this environment
 * (see src/lib/auth/clerk-env.ts), the public site carries on as normal and
 * the signed-in pages fail closed.
 */

const isAccountRoute = createRouteMatcher(["/dashboard(.*)", "/profile(.*)", "/account(.*)", "/admin(.*)"]);

let clerk: NextMiddleware | null = null;

function clerkProxy(): NextMiddleware {
  clerk ??= clerkMiddleware(
    async (auth, request) => {
      if (request.nextUrl.pathname === "/") {
        const { userId } = await auth();
        if (userId) return NextResponse.redirect(new URL("/dashboard", request.url));
        return;
      }
      if (isAccountRoute(request)) await auth.protect();
    },
    { signInUrl: "/login", signUpUrl: "/accept-invite" },
  );
  return clerk;
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (currentClerkConfig().status !== "ready") {
    if (isAccountRoute(request)) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  return clerkProxy()(request, event);
}

/**
 * Only the routes that read the session on the server, plus the home page's
 * redirect. The other public pages never do (the header's account menu reads
 * it in the browser), so they are left out entirely and stay exactly as fast
 * and cacheable as before. Any new route that calls auth() or getViewer()
 * must be added here.
 */
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/profile/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/login/:path*",
    "/accept-invite/:path*",
    "/api/account/:path*",
    // Sheet-music files: members-only ones are served after a session check.
    "/library/songs/:song/sheet-music/:file",
  ],
};
