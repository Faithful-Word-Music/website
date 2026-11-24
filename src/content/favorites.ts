import type { FavoriteErrorCode, FavoriteSort } from "@/lib/favorites-api";

/** Editable copy for Favorites, in the Library. */
export const favoritesContent = {
  metaTitle: "Favorites",
  metaDescription: "The songs you have saved in the Library.",
  title: "Favorites",
  lead: "The songs you have saved, in one place.",

  sections: {
    label: "Library sections",
    allSongs: "All Songs",
    favorites: "Favorites",
  },

  search: {
    label: "Search your favorites",
    placeholder: "Search by title, number or collection",
  },
  sortLabel: "Sort by",
  sorts: {
    recent: "Recently Added",
    title: "Alphabetical",
    number: "Hymn Number",
  } satisfies Record<FavoriteSort, string>,

  /** Singular and plural. {count} and {total} are replaced at render time. */
  count: ["{count} song", "{count} songs"],
  matchCount: ["{count} of {total} songs", "{count} of {total} songs"],

  loading: "Loading your favorites",
  loadMore: "Load more",
  loadingMore: "Loading",

  emptyTitle: "No favorites yet",
  emptyBody: "Tap the heart on any song to keep it here, ready for when you need it.",
  emptyAction: "Browse all songs",

  /** {query} is replaced at render time. */
  noMatchTitle: "No favorites match “{query}”",
  noMatchBody: "Try part of a title, a hymn number or a collection.",
  clearSearch: "Clear search",

  errorTitle: "We could not load your favorites",
  errorBody: "Nothing has been lost. Please try again.",
  retry: "Try again",
  blockedTitle: "Favorites are not available for this account",

  directoryNotice: "Song details could not be loaded just now. Your favorites are safe.",
  directorySearch: "Search needs song details, which could not be loaded just now.",
  sortedByDate: "Showing most recently added first until song details are back.",

  unavailable: {
    unavailable: { title: "Song no longer listed", detail: "This song is not in the Library right now." },
    ambiguous: { title: "Song could not be identified", detail: "This saved entry now matches more than one song." },
    unknown: { title: "Song details unavailable", detail: "These details could not be loaded just now." },
  },

  button: {
    /** {title} is replaced at render time. */
    add: "Add {title} to favorites",
    remove: "Remove {title} from favorites",
    loading: "Checking whether {title} is in your favorites",
    unsupported: "{title} cannot be added to favorites",
    blocked: "Favorites are not available for {title} right now",
    uncertain: "We could not confirm the change to {title}. Try again",
    removeEntry: "Remove this entry from favorites",
    /** The words beside the heart on a song's own page. */
    saved: "Saved to favorites",
    removeShort: "Remove",
  },

  /** Shown beside a control. {state} is "saved" or "not saved". */
  uncertainTitle: "We could not confirm that change",
  uncertainSeen: "Last check: {state}. An earlier request may still finish.",
  uncertainSaved: "saved",
  uncertainNotSaved: "not saved",
  uncertainUnknown: "unknown",
  uncertainAdd: "Add to favorites",
  uncertainRemove: "Remove from favorites",
  failed: "That did not save. Please try again.",
  offline: "You appear to be offline, so that was not saved.",

  errors: {
    unauthorized: "Your session has ended. Please log in again.",
    "profile-blocked": "Please finish your profile first - it only takes a few minutes.",
    "account-erasing": "This account is being closed, so favorites are not available.",
    "account-mismatch": "You have switched accounts, so that change was not made.",
    "cross-origin": "That request was refused.",
    "invalid-input": "That request was not valid.",
    "invalid-cursor": "The list changed. Please reload it.",
    "unknown-song": "That song could not be found.",
    "unsupported-song": "That song cannot be added to favorites.",
    "ambiguous-song": "That song could not be identified.",
    "directory-unavailable": "Song details could not be loaded just now. Please try again.",
    unavailable: "Favorites are temporarily unavailable. Please try again.",
  } satisfies Record<FavoriteErrorCode, string>,
} as const;
