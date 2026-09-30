/**
 * Which Clerk instance this deployment talks to, and whether that is allowed.
 *
 * Clerk Development and Production are separate instances with separate users:
 *
 *   Local (next dev)     -> Development   pk_test_ / sk_test_
 *   Vercel Preview       -> Development   pk_test_ / sk_test_
 *   Vercel Production    -> Production    pk_live_ / sk_live_
 *
 * The instance is read from the key prefixes, never from a separate setting,
 * so it cannot disagree with the keys actually in use. It also labels every
 * account row in the database (`clerk_env`): Local, Preview and Production
 * share one Neon database, and this keeps test users and requests out of the
 * production admin.
 *
 * Pure - no server-only import - so it can be unit tested and read by the proxy.
 */

export type ClerkEnv = "development" | "production";

export type ClerkConfig =
  | { status: "ready"; env: ClerkEnv }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

interface KeyInput {
  publishableKey: string | undefined;
  secretKey: string | undefined;
  /** process.env.VERCEL_ENV: "production" | "preview" | "development" | undefined (local). */
  vercelEnv: string | undefined;
}

function instanceOf(key: string, live: string, test: string): ClerkEnv | null {
  if (key.startsWith(live)) return "production";
  if (key.startsWith(test)) return "development";
  return null;
}

/**
 * Decides whether accounts can run here. The reasons never include key values,
 * so they are safe to log.
 */
export function resolveClerkConfig({ publishableKey, secretKey, vercelEnv }: KeyInput): ClerkConfig {
  if (!publishableKey && !secretKey) return { status: "missing" };
  if (!publishableKey) return { status: "invalid", reason: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set" };
  if (!secretKey) return { status: "invalid", reason: "CLERK_SECRET_KEY is not set" };

  const publicEnv = instanceOf(publishableKey, "pk_live_", "pk_test_");
  const secretEnv = instanceOf(secretKey, "sk_live_", "sk_test_");
  if (!publicEnv) return { status: "invalid", reason: "the publishable key is not a Clerk pk_test_/pk_live_ key" };
  if (!secretEnv) return { status: "invalid", reason: "the secret key is not a Clerk sk_test_/sk_live_ key" };
  if (publicEnv !== secretEnv) {
    return {
      status: "invalid",
      reason: "the publishable and secret keys belong to different Clerk instances (one test, one live)",
    };
  }

  const isProductionDeployment = vercelEnv === "production";
  if (isProductionDeployment && publicEnv === "development") {
    return {
      status: "invalid",
      reason: "Clerk Development (test) keys are set on the Production deployment - use the pk_live_/sk_live_ keys",
    };
  }
  if (!isProductionDeployment && publicEnv === "production") {
    return {
      status: "invalid",
      reason: `Clerk Production (live) keys are set outside Production (${vercelEnv ?? "local"}) - use the pk_test_/sk_test_ keys`,
    };
  }

  return { status: "ready", env: publicEnv };
}

/** The configuration for this process, from its environment variables. */
export function currentClerkConfig(): ClerkConfig {
  return resolveClerkConfig({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

let warned = false;

/** Logs a misconfiguration once per instance - the reason only, never a key. */
export function warnIfMisconfigured(config: ClerkConfig): void {
  if (config.status !== "invalid" || warned) return;
  warned = true;
  console.error(`[auth] Accounts are disabled: ${config.reason}.`);
}
