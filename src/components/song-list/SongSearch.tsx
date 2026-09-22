"use client";

import { songListContent } from "@/content/song-list";

/** Search control. Glass is used here as one of the site's three glass surfaces. */
export function SongSearch({
  value,
  onChange,
  inputId,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  inputId: string;
  describedBy?: string;
}) {
  const { search } = songListContent;

  return (
    <div className="w-full sm:max-w-sm">
      <label htmlFor={inputId} className="sr-only">
        {search.label}
      </label>
      <div className="glass relative flex items-center rounded-full">
        <span aria-hidden="true" className="pl-4 text-muted">
          {/* A magnifier drawn as a simple glyph keeps the bundle free of an icon set. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={search.placeholder}
          aria-describedby={describedBy}
          autoComplete="off"
          className="min-h-11 w-full bg-transparent px-3 text-sm text-ink placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
          >
            <span className="sr-only">{search.clear}</span>
            <span aria-hidden="true">&times;</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
