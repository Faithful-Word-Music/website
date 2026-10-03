/**
 * The words a button shows while its action runs and once it is done
 * (Button's `pendingLabel` / `doneLabel`, src/components/ui/use-action.ts).
 * One set for the whole site, so "Saving…" reads the same everywhere.
 */
export const feedbackContent = {
  saving: "Saving…",
  saved: "Saved",
  publishing: "Publishing…",
  published: "Published",
  adding: "Adding…",
  added: "Added",
  creating: "Creating…",
  created: "Created",
  sending: "Sending…",
  sent: "Sent",
  deleting: "Deleting…",
  deleted: "Deleted",
  removing: "Removing…",
  removed: "Removed",
  restoring: "Restoring…",
  restored: "Restored",
  updating: "Updating…",
  updated: "Updated",
  working: "Working…",
  done: "Done",
  /** When an action could not reach the server at all. */
  failed: "Something went wrong. Please try again.",
  photoSaved: "Profile photo updated.",
  photoRemoved: "Profile photo removed.",
  serviceDeleted: "Special service deleted.",
  accountDeleted: "Account deleted.",
  roleDeleted: "Role deleted.",
} as const;
