/**
 * Small helpers the event builders share. Pure.
 */

/** Fills a wording's {placeholders}: fill("{name} is away", { name: "Alex" }). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : whole));
}

/** "A", "A and B", "A, B and C". */
export function listOf(items: readonly string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
