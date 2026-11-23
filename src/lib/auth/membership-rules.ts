import type { AffiliationStatus } from "./membership-store";

/** Who may change whose church affiliation, and when activation is allowed. Pure, so each rule is tested. */

export type AffiliationRefusal = "self" | "admin-target";

export function affiliationRefusal(input: {
  actorId: string;
  targetId: string;
  actorIsAdmin: boolean;
  targetIsAdmin: boolean;
}): AffiliationRefusal | null {
  if (input.actorId === input.targetId) return "self";
  if (input.targetIsAdmin && !input.actorIsAdmin) return "admin-target";
  return null;
}

const MAX_REASON = 500;
const isStatus = (value: unknown): value is AffiliationStatus => value === "verified" || value === "revoked";

/** Validates what the browser sent. Null when any of it is not usable. */
export function parseAffiliationChange(
  expected: unknown,
  next: unknown,
  reason: unknown,
): { expected: AffiliationStatus | null; next: AffiliationStatus; reason: string } | null {
  if (expected !== null && !isStatus(expected)) return null;
  if (!isStatus(next)) return null;
  if (reason !== undefined && typeof reason !== "string") return null;
  const text = (reason ?? "").trim();
  if (text.length > MAX_REASON) return null;
  return { expected, next, reason: text };
}

export type ActivationBlocker = "already" | "no-file-rights";

/** Refuses an activation that would leave nobody able to open any sheet music. */
export function activationBlocker(report: {
  activated: boolean;
  files: { public: number; restricted: number; withheld: number };
}): ActivationBlocker | null {
  if (report.activated) return "already";
  return report.files.public + report.files.restricted === 0 ? "no-file-rights" : null;
}
