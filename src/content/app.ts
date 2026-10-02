/**
 * Editable copy for the installed app's own controls: the PDF viewer and
 * pull-to-refresh. Only seen inside the installed app on a phone or tablet
 * (src/components/app/InstalledApp.tsx).
 */
export const appContent = {
  pdfViewer: {
    /** The title until the file's own name is known. */
    fallbackTitle: "PDF",
    close: "Close",
    loading: "Loading the PDF…",
    /** iPhone/iPad: opens the share sheet, which has Save to Files, Print and other apps. */
    saveOrShare: "Save or share",
    share: "Share",
    download: "Download",
    /** {page} and {count} are replaced at render time. */
    pageLabel: "Page {page} of {count}",
    errors: {
      signIn: "Please log in to open this sheet music.",
      restricted: "Your account doesn't include access to this sheet music.",
      generic: "This PDF couldn't be opened. Please try again in a moment.",
    },
  },

  pullToRefresh: {
    pull: "Pull to refresh",
    release: "Release to refresh",
  },
} as const;
