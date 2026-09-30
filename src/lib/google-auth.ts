import "server-only";

import { JWT } from "google-auth-library";

/**
 * The website's own Google identity: a service account with read-only access
 * to the Sheet Music Index and the sheet-music folder in Drive, both of which
 * stay private. Visitors never talk to Google; only the server does.
 *
 * The credentials are two server-only environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   client_email from the key's JSON file
 *   GOOGLE_PRIVATE_KEY             private_key from the same file
 *
 * READ ONLY. Both scopes are the read-only ones.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

let client: JWT | null = null;

/**
 * The private key as PEM. Vercel keeps real line breaks, but a key pasted
 * from the JSON file arrives with literal "\n" sequences, sometimes still
 * wrapped in the JSON's quotes - all three forms work.
 */
export function normalizePrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "");
}

/** Whether the service account's credentials are set in this environment. */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

/**
 * A short-lived access token, or null when the credentials are not set. The
 * library caches the token and renews it shortly before it expires.
 *
 * Throws when Google refuses the credentials; the message never includes the key.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;

  client ??= new JWT({ email, key: normalizePrivateKey(key), scopes: SCOPES });

  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("no token returned");
    return token;
  } catch (error) {
    // Start afresh next time, in case the variables are corrected.
    client = null;
    throw new Error(
      `Google refused the service account credentials (${
        error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : "unknown error"
      })`,
    );
  }
}
