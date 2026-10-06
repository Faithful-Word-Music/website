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

/** A clock run back: the saved conversations, wherever the list of them can be opened. */
export function HistoryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.4 2.6v2.6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5.2V8l1.9 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A pencil over a fresh page: "New chat", wherever a conversation can be started over. */
export function NewChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M7.25 2.75H4a1.5 1.5 0 0 0-1.5 1.5V12A1.5 1.5 0 0 0 4 13.5h7.75a1.5 1.5 0 0 0 1.5-1.5V8.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.3 2.2a1.06 1.06 0 0 1 1.5 1.5L8.6 8.9l-2.1.6.6-2.1 5.2-5.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
