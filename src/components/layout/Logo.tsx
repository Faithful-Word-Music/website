/**
 * The Faithful Word Music mark: the musical *forte* sign on a stave.
 *
 * Forte is real notation - the dynamic marking meaning "strong", the
 * instruction to sing out - and it is also, conveniently, a calligraphic "f"
 * for Faithful. So the mark is at once the brand's initial and a piece of
 * engraving, which is the register the rest of the site works in.
 *
 * The four stave rules echo the stave behind the wordmark in the hero, and
 * they break around the glyph the way an engraver would interrupt a rule for a
 * symbol. That break is painted as an ink-coloured halo beneath the white
 * stroke rather than cut with an SVG <mask>, which keeps this a Server
 * Component with no generated IDs that could collide when the mark is rendered
 * more than once on a page.
 *
 * This is the only mark. src/app/icon.svg is the same artwork for the browser
 * tab - if the glyph changes here, change it there too.
 */

/** The forte glyph: bottom hook, leaning stem, top hook. */
const FORTE_STEM =
  "M14 48 C12.3 52.8 19.8 54.4 23 48.5 C26.8 40.5 31 29.5 34.8 22.5 C37.5 16.5 44.5 15.4 46.6 19.8";
/** Its crossbar. */
const FORTE_BAR = "M18.5 36.5 L37 33";

export function Logo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      // Decorative: the wordmark beside it already names the site.
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="var(--color-ink)" />

      <g stroke="var(--color-gold)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M6 21 H58" />
        <path d="M6 29 H58" />
        <path d="M6 37 H58" />
        <path d="M6 45 H58" />
      </g>

      {/* Breaks the stave rules around the glyph. */}
      <g
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={FORTE_STEM} />
        <path d={FORTE_BAR} />
      </g>

      <g
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={FORTE_STEM} />
        <path d={FORTE_BAR} />
      </g>
    </svg>
  );
}
