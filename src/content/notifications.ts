/**
 * Wording for notifications: the bell, the Notifications page, each person's
 * notification settings and the admin's notification policies. The categories'
 * own names and descriptions start in src/lib/notifications/model.ts and
 * live in the database.
 */
export const notificationsContent = {
  title: "Notifications",
  eyebrow: "Your account",
  lead: "What has happened that you should know about.",

  /** The Notifications · Settings links at the top of both pages. */
  nav: {
    label: "Notifications",
    all: "Notifications",
    settings: "Settings",
  },

  bell: {
    /** The bell's accessible name: with nothing unread, then with a count ({count} is replaced). */
    label: "Notifications",
    unread: ["Notifications, {count} unread", "Notifications, {count} unread"],
    panelTitle: "Notifications",
    close: "Close",
    viewAll: "View all notifications",
  },

  list: {
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    /** Read out before an unread notification's title. */
    unread: "Unread",
    important: "Important",
    loadMore: "Show older notifications",
    loading: "Loading…",
    unreadCount: ["{count} unread", "{count} unread"],
    allRead: "All read",
  },

  empty: {
    title: "You're all caught up",
    body: "No notifications yet. When something needs your attention, it will be here.",
  },

  errors: {
    load: "Your notifications could not be loaded. Please try again.",
    update: "That could not be saved. Please try again.",
    retry: "Try again",
    signedOut: "Your session has ended. Please log in again.",
  },

  /** Relative times. {count} is replaced. */
  time: {
    now: "Just now",
    minutes: ["{count} min ago", "{count} min ago"],
    hours: ["{count} hr ago", "{count} hr ago"],
    yesterday: "Yesterday",
    days: ["{count} day ago", "{count} days ago"],
  },

  channels: {
    in_app: { name: "In the app", detail: "The bell at the top of the site, and this page." },
    push: {
      name: "Push",
      detail: "Sent to your phone or computer. Push notifications arrive in a later update; your choices here are saved for then.",
    },
    email: { name: "Email", detail: "Email notifications are not available yet." },
  },

  /** /notifications/settings */
  settings: {
    title: "Notification settings",
    lead: "Choose what you hear about, and how. Some notifications are always on, so nothing important is missed.",
    on: "On",
    off: "Off",
    /** A mandatory category: on, and not the person's to change. */
    required: "Always on",
    requiredDetail: "Required by Faithful Word Music",
    /** A channel not offered for a category. */
    unavailable: "Not available",
    comingSoon: "Coming soon",
    /** The accessible name of one switch. {category} and {channel} are replaced. */
    switchLabel: "{category}: {channel}",
    saved: "Saved.",
    empty: "There is nothing to choose yet.",
    unavailableTitle: "Notification settings are unavailable",
    unavailableBody: "Your settings could not be loaded just now. Please try again later.",
    locked: "That notification is always on and cannot be changed.",
    notOffered: "That is not available yet.",
    /** On /account: the way here. */
    accountLink: "Notification settings",
    accountLead: "Choose which notifications you receive.",
  },

  /** /admin/notifications */
  admin: {
    title: "Notifications",
    intro:
      "How each kind of notification reaches people. A policy applies to everyone; within it, each person chooses for themselves under their own notification settings. Changing a policy never erases anyone's choices: they count again whenever the policy allows.",
    policies: {
      mandatory: { label: "Mandatory", detail: "Always on. Members cannot turn it off." },
      default_on: { label: "Default on", detail: "On unless a member turns it off." },
      default_off: { label: "Default off", detail: "Off unless a member turns it on." },
      unavailable: { label: "Unavailable", detail: "Not offered." },
    },
    channels: {
      in_app: { name: "In the app", note: "" },
      push: { name: "Push", note: "Kept for when push notifications launch. Nothing is pushed yet." },
      email: { name: "Email", note: "Coming soon. Email notifications cannot be switched on yet." },
    },
    /** A select's accessible name. {category} and {channel} are replaced. */
    selectLabel: "{category}: {channel} policy",
    save: "Save",
    saved: "Saved.",
    retired: "Retired",
    unavailableTitle: "Notification policies are unavailable",
    unavailableBody: "The policies could not be loaded just now. Please try again later.",
    notAllowed: "That policy cannot be chosen for that channel yet.",
    unknown: "Unknown notification category.",
    /** Development only: a way to see a notification arrive before any feature sends one. */
    test: {
      title: "Send a test notification",
      body: "Development only. Sends one notification to you, through the same path every real one will take, so you can see it arrive.",
      category: "Category",
      button: "Send me a test notification",
      sent: "Sent. Look at the bell.",
      skipped: "Nothing was sent: this category is switched off for you in the app.",
      productionOnly: "Test notifications can only be sent in development.",
      notificationTitle: "Test notification",
      notificationBody: "This is a test of {category}. If you can read this, in-app notifications are working.",
    },
  },
} as const;
