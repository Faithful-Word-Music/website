import { cn } from "@/components/ui/cn";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { recordingsContent } from "@/content/recordings";
import type { Recording } from "@/lib/recordings/model";
import { providerLabel } from "@/lib/recordings/providers";

const { disclaimer, song: songCopy } = recordingsContent;

/**
 * The approved disclaimer, the one place its words are shown from. Always in
 * view beside recordings - never behind a tooltip, never dismissible.
 */
export function RecordingDisclaimer({ className }: { className?: string }) {
  return (
    <aside
      aria-label={disclaimer.title}
      className={cn("flex gap-3 rounded-card border border-line border-l-2 border-l-gold bg-surface px-4 py-3.5 sm:px-5", className)}
    >
      {/* An "i" in a circle: information, not a warning. Sits on the heading's line. */}
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" className="mt-px shrink-0 text-gold-dark">
        <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="6.25" r="1" fill="currentColor" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{disclaimer.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{disclaimer.text}</p>
      </div>
    </aside>
  );
}

/** The short reminder under a player. */
export function RecordingReminder({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted", className)}>{disclaimer.reminder}</p>;
}

/** "Source: YouTube — Faithful Word Baptist Church · Open original ↗" */
export function SourceAttribution({ recording, className }: { recording: Pick<Recording, "provider" | "sourceName" | "sourceUrl">; className?: string }) {
  const provider = providerLabel(recording.provider);
  return (
    <p className={cn("text-xs text-muted", className)}>
      {songCopy.source} {provider}
      {recording.sourceName ? <> — {recording.sourceName}</> : null}
      {" · "}
      {/* Raised: it stays its own link inside a row that plays when clicked (RecordingList). */}
      <ExternalLink href={recording.sourceUrl} showIcon className="relative z-10 underline decoration-dotted underline-offset-2 hover:text-ink">
        {songCopy.original}
      </ExternalLink>
    </p>
  );
}

/** Arrangement and key, when given: "Piano demonstration · Key of G". */
export function recordingDetails(recording: Pick<Recording, "arrangement" | "musicKey">): string | null {
  const parts = [recording.arrangement, recording.musicKey ? songCopy.key.replace("{key}", recording.musicKey) : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
