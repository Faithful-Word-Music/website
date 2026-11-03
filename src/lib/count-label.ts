/**
 * A count as a badge shows it: "99+" rather than a number too wide for the
 * badge, and nothing at all at zero (or for anything that is not a count).
 */
export function countLabel(count: number, max = 99): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > max ? `${max}+` : String(Math.floor(count));
}
