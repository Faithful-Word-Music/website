#!/usr/bin/env node
/**
 * Makes one existing Clerk account an Administrator of the website.
 *
 * This is the ONLY way the first administrator is created. The site never
 * promotes anyone by itself - not the first person to sign up, not a
 * particular email address. After this, administrators manage everyone else
 * from /admin.
 *
 * Clerk Development and Production have separate users, so run it once per
 * instance. The instance is read from CLERK_SECRET_KEY:
 *
 *   Development (sk_test_):
 *     npm run auth:bootstrap-admin -- you@example.com
 *
 *   Production (sk_live_) - needs the production keys, and --production to
 *   confirm you mean it:
 *     node --env-file=.env.production.local scripts/bootstrap-admin.mjs you@example.com --production
 *
 * The argument is the account's email address or its Clerk user ID (user_...).
 * The account must already exist in that Clerk instance - sign up through an
 * invitation (or create the user in the Clerk dashboard) first.
 *
 * Needs CLERK_SECRET_KEY and DATABASE_URL. Safe to run more than once.
 */

import { neon } from "@neondatabase/serverless";

import { ADMIN_ROLE_ROW, AUTH_SCHEMA } from "../src/lib/auth/schema.mjs";

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmedProduction = args.includes("--production");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) fail("Give the account's email address or Clerk user ID, e.g.\n    npm run auth:bootstrap-admin -- you@example.com");

const secretKey = process.env.CLERK_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!secretKey) fail("CLERK_SECRET_KEY is not set (check .env.local).");
if (!databaseUrl) fail("DATABASE_URL is not set (check .env.local).");

const env = secretKey.startsWith("sk_live_") ? "production" : secretKey.startsWith("sk_test_") ? "development" : null;
if (!env) fail("CLERK_SECRET_KEY is not a Clerk sk_test_/sk_live_ key.");

console.log(`\n  Clerk instance: ${env === "production" ? "PRODUCTION (live users)" : "Development (test users)"}`);
if (env === "production" && !confirmedProduction) {
  fail("These are PRODUCTION keys. Re-run with --production to confirm.");
}

async function clerk(path) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) fail(`Clerk answered ${response.status} for ${path.split("?")[0]}.`);
  return response.json();
}

let user;
if (target.startsWith("user_")) {
  user = await clerk(`/users/${encodeURIComponent(target)}`);
} else if (target.includes("@")) {
  const matches = await clerk(`/users?email_address=${encodeURIComponent(target.trim().toLowerCase())}&limit=2`);
  if (Array.isArray(matches) && matches.length > 1) fail("More than one account has that email address. Use the user ID instead.");
  user = Array.isArray(matches) ? matches[0] : null;
} else {
  fail("That is neither an email address nor a Clerk user ID (user_...).");
}

if (!user) {
  fail(`No account "${target}" in this Clerk ${env} instance.\n    Development and Production have separate users - create the account in this instance first.`);
}

const email = user.email_addresses?.find((item) => item.id === user.primary_email_address_id)?.email_address ?? "(no email)";
const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "(no name)";

const sql = neon(databaseUrl);
for (const statement of AUTH_SCHEMA) await sql.query(statement);
await sql.query(
  `INSERT INTO roles (clerk_env, key, label, description, is_system) VALUES ($1, $2, $3, $4, true)
   ON CONFLICT DO NOTHING`,
  [env, ADMIN_ROLE_ROW.key, ADMIN_ROLE_ROW.label, ADMIN_ROLE_ROW.description],
);
await sql.query(
  `INSERT INTO user_roles (clerk_env, clerk_user_id, role_key, granted_by) VALUES ($1, $2, $3, 'bootstrap-admin')
   ON CONFLICT DO NOTHING`,
  [env, user.id, ADMIN_ROLE_ROW.key],
);

console.log(`  ✓ ${name} <${email}> (${user.id}) is now an Administrator in ${env}.\n`);
console.log("    Log in and open /admin. Everyone else can be managed from there.\n");
