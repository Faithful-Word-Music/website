/**
 * Server start-up hook (Next.js instrumentation).
 *
 * With DASHBOARD_TIMING=1 (local or preview only), every call to Clerk's
 * Backend API is logged as "[clerk:call] GET /v1/users/... 84ms", so the
 * Clerk calls behind one page view can be counted. Off by default: nothing
 * is wrapped and nothing is logged.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DASHBOARD_TIMING !== "1") return;

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("api.clerk.com") && !url.includes("api.clerk.dev")) return original(input, init);
    const started = performance.now();
    try {
      return await original(input, init);
    } finally {
      const { pathname } = new URL(url);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      console.log(`[clerk:call] ${method} ${pathname} ${Math.round(performance.now() - started)}ms`);
    }
  };
}
