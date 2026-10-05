/**
 * Conductor's mark: a baton mid-beat, with the arc it has just drawn. Used
 * beside the name wherever Conductor appears, so it reads as the site's own
 * feature rather than a chat bubble.
 */
export function ConductorMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      {/* The beat's arc. */}
      <path d="M3 6.5c2.2-3 6.2-3.6 9-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      {/* The baton, and the grip at its foot. */}
      <path d="M5.2 15.8L16.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.6" cy="16.4" r="1.9" fill="currentColor" />
    </svg>
  );
}
