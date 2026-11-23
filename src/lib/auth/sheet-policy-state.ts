/**
 * Whether the sheet-access policy is in force in one Clerk environment.
 *
 *   no state             legacy (the policy has not been set up here)
 *   "prepared"           legacy (affiliations are being entered)
 *   "enforcing"          enforcing
 *   anything else        enforcing: a state nobody can read must not widen access
 *   latched              enforcing, whatever the setting says
 *
 * The latch is permanent (sheet_access_latches), so no later edit to the
 * setting can take an activated environment back to legacy.
 */
export type SheetPolicyMode = "legacy" | "enforcing";

/** The site_settings key holding this environment's state. */
export const SHEET_POLICY_SETTING = "sheet_access_policy";

export function resolveSheetPolicyMode({ setting, latched }: { setting: unknown; latched: boolean }): SheetPolicyMode {
  if (latched) return "enforcing";
  if (setting === null || setting === undefined) return "legacy";
  if (typeof setting === "object" && (setting as { state?: unknown }).state === "prepared") return "legacy";
  return "enforcing";
}
