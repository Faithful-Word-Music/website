/** Joins class names, dropping falsy values. Keeps conditional classes readable. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
