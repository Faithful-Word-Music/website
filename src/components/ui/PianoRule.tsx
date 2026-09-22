/**
 * A thin strip of piano keys used once as a section divider.
 * Purely decorative, so it is hidden from assistive technology.
 */
export function PianoRule() {
  return (
    <div aria-hidden="true" className="flex h-3 w-full justify-center opacity-[0.13]">
      <div className="piano-rule h-full w-full max-w-5xl" />
    </div>
  );
}
