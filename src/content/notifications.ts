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
      detail: "Sent to each device you have switched push on for, even when the site is closed.",
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
    /** Under the list: what "Always on" can and cannot mean for push. */
    requiredPushNote:
      "\"Always on\" means it cannot be switched off here. A push still only reaches a device where push is switched on and your browser or device allows notifications.",
    /** The heading over the categories, beneath "Push on this device". */
    categoriesTitle: "What you hear about",
    categoriesLead: "These choices follow you to every device.",
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

  /**
   * Push on THIS browser or installed app (components/notifications/PushDevice.tsx):
   * the device's side of things, which is not the same as the choices above.
   */
  device: {
    title: "Push on this device",
    lead: "Push notifications reach you when Faithful Word Music is closed. They are switched on separately on each phone, tablet and computer you use.",
    /** What each state says: a line, and where it helps, what to do about it. */
    states: {
      checking: { status: "Checking this device…", detail: "" },
      off: {
        status: "Push notifications are off on this device.",
        detail: "Your browser will ask for permission once.",
      },
      enabled: {
        status: "Push notifications are on for this device.",
        detail: "What is sent here follows your choices below.",
      },
      denied: {
        status: "Notifications are blocked for this site.",
        detail:
          "Faithful Word Music cannot ask again. Allow notifications for this site in your browser or device settings, then come back to this page.",
      },
      unsupported: {
        status: "This browser cannot receive push notifications.",
        detail: "A current version of Chrome, Edge, Firefox or Safari can, and so can the installed app.",
      },
      "needs-install": {
        status: "On an iPhone or iPad, push needs the installed app.",
        detail:
          "Add Faithful Word Music to your Home Screen (Share, then Add to Home Screen), open it from there, and switch push on from this page inside the app.",
      },
      "needs-repair": {
        status: "This device needs to be reconnected.",
        detail: "Push was switched on here, but the connection to this device was lost.",
      },
      "not-set-up": {
        status: "Push notifications are not set up for this site yet.",
        detail: "",
      },
    },
    enable: "Enable push notifications",
    enabling: "Enabling…",
    disable: "Turn off on this device",
    disabling: "Turning off…",
    repair: "Reconnect this device",
    repairing: "Reconnecting…",
    installLink: "How to install the app",
    errors: {
      failed: "Push notifications could not be changed on this device. Please try again.",
      notSetUp: "Push notifications are not set up for this site yet.",
      notGranted: "Permission was not given, so push notifications are still off.",
    },
    /** The Dashboard's reminder, until it is put away or push is switched on. */
    card: {
      title: "Get important music updates",
      detail: "Receive service plan, availability and account notifications even when Faithful Word Music isn't open.",
      button: "Enable notifications",
      dismiss: "Not now",
      dismissLabel: "Not now: hide this reminder about notifications",
    },
  },

  /**
   * What each notification says (built in src/lib/notifications/events/).
   * {service} is a service's name ("Sunday Morning"), {date} its day
   * ("Sunday, October 18"), {name} a person's first name. A pair is the
   * wording for one and for several; {count} is replaced.
   */
  events: {
    servicePlan: {
      publishedOne: {
        title: "{service} song list published",
        body: "The song list for {service}, {date}, has been published.",
      },
      publishedMany: {
        title: "New song lists published",
        /** {services} is "Sunday Morning, Sunday Evening and Wednesday Evening". */
        body: "The song lists for {services} have been published.",
        /** When there are too many to name. */
        bodyCount: "{count} song lists have been published.",
      },
      updated: {
        title: "{service} song list updated",
        /** {change} is one of the sentences below. */
        body: "{date}: {change}",
        added: "{song} was added.",
        removed: "{song} was removed.",
        replaced: "{removed} was replaced with {added}.",
        key: "{song} is now in {key}.",
        keyCleared: "{song} no longer has a key set.",
        time: "The service now starts at {time}.",
        several: "Several changes were made to the published song list.",
      },
      withdrawn: {
        title: "{service} song list is being revised",
        body: "The published song list for {date} has been returned to draft.",
        insertBody: "The published song list for {date} was returned to draft after this week's insert changed.",
        manyTitle: "Published song lists are being revised",
        manyBody: [
          "{count} upcoming song list was returned to draft after this week's insert changed.",
          "{count} upcoming song lists were returned to draft after this week's insert changed.",
        ],
      },
      cancelled: {
        title: "{service} cancelled",
        body: "The {service} service on {date} has been cancelled.",
      },
      restored: {
        title: "{service} restored",
        body: "The {service} service on {date} has been restored. Its song list has not been published yet.",
      },
      /** Joins the last two of a list of services. */
      and: "and",
    },
    availability: {
      /** How a choice reads in a sentence. */
      states: { available: "available", unavailable: "unavailable", normal: "back to normal" },
      /** When the person's name cannot be found. */
      someone: "A team member",
      service: {
        title: "{name} is {state} for {service}",
        body: "Availability changed for {date}.",
        /** To the person, when a leader changed it for them. */
        yoursTitle: "Your availability was changed",
        yoursBody: "You are now {state} for {service}, {date}.",
        /** To the other leaders, when a leader changed someone's. */
        theirsTitle: "{name}'s availability changed",
        theirsBody: "{name} is now {state} for {service}, {date}.",
      },
      range: {
        absenceTitle: "{name} reported an absence",
        title: "{name}'s availability changed",
        /** {from} and {to} are days ("October 18"). */
        body: ["{name} is {state} {from} to {to}, affecting {count} service.", "{name} is {state} {from} to {to}, affecting {count} services."],
        oneDayBody: ["{name} is {state} on {from}, affecting {count} service.", "{name} is {state} on {from}, affecting {count} services."],
        yoursTitle: "Your availability was changed",
        yoursBody: ["You are now {state} {from} to {to}, affecting {count} service.", "You are now {state} {from} to {to}, affecting {count} services."],
        yoursOneDayBody: ["You are now {state} on {from}, affecting {count} service.", "You are now {state} on {from}, affecting {count} services."],
      },
      normal: {
        title: "{name} changed their normal services",
        /** {services} is "Sunday morning, Sunday evening". */
        body: "{name} now normally serves: {services}.",
        noneBody: "{name} no longer has any normal services.",
        yoursTitle: "Your normal services were changed",
        yoursBody: "You are now normally down for: {services}.",
        yoursNoneBody: "You no longer have any normal services.",
      },
    },
    account: {
      requestCreated: {
        title: "New account request",
        body: "A new request for a Faithful Word Music account is waiting for review.",
      },
      accessChanged: {
        title: "Your account access changed",
        body: "Your Faithful Word Music roles or permissions were updated.",
      },
    },
    library: {
      indexProblem: {
        title: "Library index needs attention",
        body: [
          "{count} song file could not be indexed. Review the library index status.",
          "{count} song files could not be indexed. Review the library index status.",
        ],
      },
    },
  },

  /**
   * Admin -> Notifications: writing and sending an announcement, what was
   * sent, and the templates kept for next time (send_notifications).
   */
  center: {
    /** The group's pages in the admin sidebar. */
    nav: { send: "Send", history: "History", templates: "Templates", policies: "Policies" },

    /** The named audiences (MANUAL_AUDIENCES in src/lib/notifications/manual.ts). */
    audiences: {
      everyone: { label: "Everyone", detail: "Every account." },
      musicTeam: { label: "Music Team", detail: "Everyone on the availability board." },
      musicians: { label: "Musicians", detail: "Everyone with the Musician role." },
      songLeaders: { label: "Song Leaders", detail: "Everyone with the Song Leader role." },
      planners: { label: "Music Director / planners", detail: "Whoever plans the services." },
      administrators: { label: "Administrators", detail: "Everyone with the Administrator role." },
      servicePlanViewers: { label: "Service Plan Viewers", detail: "Whoever prepares from the published song lists." },
      availabilityManagers: { label: "Availability Managers", detail: "Whoever looks after availability." },
      aiUsers: { label: "AI Users", detail: "Whoever may use the AI features." },
    },

    priorities: {
      normal: { label: "Normal", detail: "An ordinary message." },
      important: { label: "Important", detail: "Marked Important, and pushed with high urgency." },
      critical: { label: "Critical", detail: "Marked Important, and pushed with high urgency. Keep it for the exceptional." },
    },
    priorityNote: "Important and Critical stand out because they are rare. Use them on purpose.",

    compose: {
      title: "Send a notification",
      intro:
        "Write a message and choose who receives it. How it reaches each person, in the app and by push, follows the Announcements policy and their own notification settings.",
      messageHeading: "Message",
      titleLabel: "Title",
      titlePlaceholder: "Rehearsal moved to Thursday",
      bodyLabel: "Message",
      bodyPlaceholder: "What people need to know.",
      /** {left} is replaced. */
      charsLeft: "{left} left",
      linkLabel: "Open when tapped",
      linkHint: "Optional",
      linkPlaceholder: "/song-list",
      linkHelp: "A page on this site, beginning with a slash. Leave it empty for a message that leads nowhere.",
      linkInvalid: "That is not a page on this site. Use an address like /song-list.",
      priorityLabel: "Priority",
      audienceHeading: "Who receives it",
      audienceLead: "Choose as many as you like. Anyone matching at least one receives it, once.",
      groupsLabel: "Groups",
      rolesLabel: "Roles",
      instrumentsLabel: "Instruments",
      instrumentsHint: "Everyone who lists the instrument on their profile.",
      archived: "(archived)",
      peopleLabel: "Specific people",
      peopleSearch: "Search people by name",
      peopleNone: "Nobody matches.",
      peopleMore: ["{count} more. Keep typing to narrow it down.", "{count} more. Keep typing to narrow it down."],
      /** A chosen person's remove button. {name} is replaced. */
      removePerson: "Remove {name}",
      nobodyChosen: "Nobody chosen yet.",
      review: "Review",
      reviewing: "Checking…",
      reset: "Start over",
      /** A draft loaded from a template or an old send. {name} is replaced. */
      fromTemplate: "Started from the template “{name}”. Changes here do not change the template.",
      fromHistory: "Started from an earlier notification. Nothing is sent until you send it.",
      dropped: "Part of the original audience no longer exists and was left out. Check who receives it.",
      notFound: "That template or notification could not be found, so this starts empty.",
      unavailableTitle: "Sending is unavailable",
      unavailableBody: "The people and roles to choose from could not be loaded just now. Please try again later.",
    },

    review: {
      title: "Review and send",
      lead: "This is what will be sent. Nothing has been sent yet.",
      previewLabel: "As it appears in the app",
      now: "Just now",
      destination: "Opens",
      noDestination: "Leads nowhere when tapped",
      audience: "Audience",
      /** {count} is replaced. */
      recipients: ["{count} person will receive this notification.", "{count} people will receive this notification."],
      nobody: "Nobody would receive this. Choose a different audience.",
      showPeople: "Show who",
      hidePeople: "Hide",
      unnamed: "Unnamed account",
      push: ["{count} of them has push on for announcements.", "{count} of them have push on for announcements."],
      pushNote: "A push reaches only devices where the person switched push on and allows notifications.",
      optedOut: [
        "{count} person in this audience has announcements switched off and will not be told.",
        "{count} people in this audience have announcements switched off and will not be told.",
      ],
      send: ["Send to {count} person", "Send to {count} people"],
      back: "Edit",
    },

    sent: {
      title: "Sent",
      /** {count} is replaced. */
      body: ["Notification sent to {count} person.", "Notification sent to {count} people."],
      note: "That is how many people were told. Whether a push reached each device is recorded under History as the results come in.",
      viewHistory: "View in History",
      another: "Send another",
    },

    template: {
      saveAs: "Save as template",
      update: "Update template",
      nameLabel: "Template name",
      namePlaceholder: "Rehearsal change",
      saveTitle: "Save as a template",
      saveLead: "Keeps the message, link, priority and audience to start from next time. Nothing is sent.",
      save: "Save template",
      saved: "Template saved.",
      updated: "Template updated.",
      cancel: "Cancel",
    },

    templates: {
      title: "Templates",
      intro: "Messages kept to start from. Using one copies it into the composer; sending never changes a template, and changing a template never changes what was already sent.",
      empty: "No templates yet. Write a notification under Send and choose “Save as template”, or make one here.",
      create: "New template",
      createTitle: "New template",
      editTitle: "Edit template",
      use: "Use",
      edit: "Edit",
      duplicate: "Duplicate",
      /** {name} is replaced. */
      copyName: "Copy of {name}",
      delete: "Delete",
      confirmDelete: "Delete this template? Notifications already sent from it are kept.",
      confirmYes: "Delete",
      confirmNo: "Keep",
      deleted: "Template deleted.",
      duplicated: "Template duplicated.",
      noBody: "No message yet",
      noAudience: "No audience chosen",
      /** {date} and {name} are replaced. */
      changed: "Changed {date}",
      by: "by {name}",
      count: ["{count} template", "{count} templates"],
      unavailableTitle: "Templates are unavailable",
      unavailableBody: "The templates could not be loaded just now. Please try again later.",
    },

    history: {
      title: "History",
      intro: "Every notification sent from here, newest first, exactly as it was sent.",
      empty: "Nothing has been sent yet.",
      /** {name} is replaced. */
      sentBy: "Sent by {name}",
      sentByUnknown: "Sender no longer listed",
      recipients: ["{count} person", "{count} people"],
      loadMore: "Show older notifications",
      loading: "Loading…",
      unavailableTitle: "The history is unavailable",
      unavailableBody: "What was sent could not be loaded just now. Please try again later.",
      /** One line under each send. */
      push: {
        none: "No push attempted",
        sent: ["{count} push accepted", "{count} pushes accepted"],
        failed: ["{count} failed", "{count} failed"],
        expired: ["{count} expired", "{count} expired"],
      },
    },

    detail: {
      back: "Back to History",
      useAgain: "Use again",
      useAgainHint: "Opens the composer with this message and audience. Nothing is sent until you send it.",
      message: "Message",
      sent: "Sent",
      sender: "Sender",
      priority: "Priority",
      destination: "Opens",
      noDestination: "Nowhere",
      template: "Started from",
      audience: "Audience",
      recipientsHeading: "Who was told",
      recipients: ["{count} person was told.", "{count} people were told."],
      /** When fewer are listed than were told. */
      recipientsGone: "Someone whose account has since been deleted is no longer listed.",
      unnamed: "Name unavailable",
      deliveryHeading: "Push delivery",
      deliveryLead:
        "One attempt is made for each device a person has switched push on for. “Accepted” means the push service took the message; it does not show that a device displayed it or that anyone read it.",
      attempts: "Push attempts",
      accepted: "Accepted by push service",
      failed: "Failed",
      expired: "Device no longer registered",
      reached: "People with an accepted push",
      notAttempted: "People with no push attempted",
      notAttemptedNote: "Push is off for them, or no device is registered, or push is not set up on this site.",
      noDevice: "No push attempted",
      status: { sent: "Accepted", failed: "Failed", expired: "No longer registered" },
      unknownDevice: "Unnamed device",
      notFoundTitle: "That notification could not be found",
      notFoundBody: "It may have been sent from a different environment.",
    },

    errors: {
      title: "Give the notification a title of up to 120 characters.",
      body: "Write a message of up to 600 characters.",
      templateBody: "Keep the message to 600 characters.",
      link: "The link must be a page on this site, such as /song-list.",
      priority: "Choose a priority.",
      audience: "Choose who receives it.",
      templateAudience: "That audience could not be saved. Choose it again.",
      stale: "Part of that audience no longer exists. Review who receives it and try again.",
      nobody: "Nobody would receive this, so it was not sent. Choose a different audience.",
      unavailable: "The notification could not be sent. Nothing was sent to anyone; please try again.",
      name: "Give the template a name of up to 80 characters.",
      notFound: "That template no longer exists.",
      tooMany: "There are already 100 templates. Delete one first.",
    },
  },

  /** /admin/notifications/policies */
  admin: {
    title: "Notification policies",
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
      push: { name: "Push", note: "Reaches only the devices a member has switched push on for. Mandatory cannot override a browser or device that blocks notifications." },
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
      sent: "Sent. Look at the bell, and at this device if push is on for it.",
      skipped: "Nothing was sent: this category is switched off for you, in the app and by push.",
      productionOnly: "Test notifications can only be sent in development.",
      notificationTitle: "Test notification",
      notificationBody: "This is a test of {category}. If you can read this, notifications are working.",
    },
  },
} as const;
