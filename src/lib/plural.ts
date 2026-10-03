/**
 * "1 song" / "2 songs": picks the singular or plural wording for a count and
 * fills in its {count} ("1,204"). Every count shown on the site goes through
 * this, with the two forms kept together in src/content/* as
 * `["{count} song", "{count} songs"]`.
 */
export function plural(forms: readonly [string, string], count: number): string {
  return forms[count === 1 ? 0 : 1].replace("{count}", count.toLocaleString("en-US"));
}
