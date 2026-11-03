/** Wording for the admin area's own frame: its sidebar and the phone's section menu. */
export const adminContent = {
  nav: {
    label: "Admin",
    /** Read out before the open section on the phone's menu button. */
    menu: "Admin section",
    close: "Close",
    /** Read out in place of the bare number on a section's count ({count} is replaced). */
    waiting: ["{count} waiting", "{count} waiting"],
    groups: {
      people: "People",
      setup: "Setup",
    },
    items: {
      overview: "Overview",
      requests: "Requests",
      invitations: "Invitations",
      users: "People",
      roles: "Roles",
      configuration: "Configuration",
      notifications: "Notifications",
      ai: "AI",
    },
    developmentNote: "Development accounts (Clerk test instance)",
  },
} as const;
