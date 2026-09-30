/** Editable copy for the Library, /library. */
export const libraryContent = {
  title: "Library",
  metaTitle: "Song Library",
  lead: "Every song we have sung or have coming up, from A to Z. Open one to see when we sing it, and its sheet music where we can share it.",

  songsTitle: "Songs",

  search: {
    label: "Find a song",
    placeholder: "Find a song by title or number",
  },

  /** Singular and plural. {count} and {total} are replaced at render time. */
  songCount: ["{count} song", "{count} songs"],
  matchCount: ["{count} of {total} songs", "{count} of {total} songs"],
  /** Explains the note beside a title. */
  sheetMusicKey: "Sheet music to view and download",
  /** Read out after a title with the note. */
  sheetMusicLabel: "sheet music available",

  /** Accessible name for the A-Z bar. */
  lettersLabel: "Songs by first letter",

  /** {query} is replaced at render time. */
  noMatchTitle: "No songs match “{query}”",
  noMatchBody: "Try part of a title, or a hymn number.",
  clearSearch: "Clear search",

  emptyTitle: "No songs yet",
  emptyBody: "Songs appear here once they are sung or scheduled.",
  errorTitle: "The Library is temporarily unavailable",
  errorBody: "We could not load the songs just now. Please try again shortly.",
} as const;
