import { siteConfig } from "@/config/site";
import type { Category, Priority, RequestType, Status, WaitingOn } from "@/lib/support/model";

/**
 * Editable copy for the Music Ministry Support Center: /contact for signed-in
 * members, and each request's page (/contact/requests/<id>). The public
 * Contact form keeps its own wording (contact.ts). What notifications say is
 * in notifications.ts (events.support).
 */
export const supportContent = {
  title: "Music Ministry Support",
  eyebrow: "Contact",
  lead: "Spotted something wrong, need sheet music, or have an idea or a question? Tell us here and follow the answer on this page.",
  directLabel: "Prefer email?",
  directEmail: siteConfig.contactEmail,

  /** The page's three parts. */
  sections: { new: "New request", mine: "My requests", manage: "Manage requests" },

  /** The four ways in. */
  entries: {
    problem: { label: "Report a problem", detail: "A wrong key or number, missing or wrong sheet music, a song list or scheduling mistake, or something on the website." },
    sheet_music: { label: "Request sheet music", detail: "Sheet music we do not have yet, or a part that is missing for a song." },
    suggestion: { label: "Suggest an improvement", detail: "An idea for the music ministry or this website." },
    question: { label: "Ask a question", detail: "Anything about the music ministry." },
  } satisfies Record<RequestType, { label: string; detail: string }>,

  categories: {
    wrong_key: "Wrong key",
    wrong_hymn_number: "Wrong hymn number",
    wrong_sheet_music: "Wrong or outdated sheet music",
    wrong_songs: "Wrong songs or song order",
    scheduling: "Service scheduling",
    leader_assignment: "Song leading assignment",
    website_bug: "Website problem",
    ministry_problem: "Something else",
    missing_sheet_music: "Missing sheet music",
    new_sheet_music: "New sheet music",
    suggestion: "Suggestion",
    question: "Question",
  } satisfies Record<Category, string>,

  statuses: { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" } satisfies Record<Status, string>,
  waiting: {
    management: "Waiting on the music ministry",
    submitter: "Waiting on your reply",
    submitterForManager: "Waiting on the sender",
    none: "Nobody waiting",
  } satisfies Record<WaitingOn | "submitterForManager", string>,
  priorities: { normal: "Normal", high: "High", urgent: "Urgent" } satisfies Record<Priority, string>,

  form: {
    whatKind: "What is it about?",
    titleLabel: "Short summary",
    titlePlaceholder: "For example: Wrong key for Amazing Grace on Sunday",
    descriptionLabel: "Details",
    descriptionPlaceholder: "What did you notice, and what should it be?",
    linksLabel: "Links (optional)",
    linksHint: "A page or file that shows the problem. We will not open anything automatically.",
    linkPlaceholder: "https://",
    addLink: "Add a link",
    removeLink: "Remove link",
    serviceLabel: "Which service?",
    serviceNone: "Not about a particular service",
    songLabel: "Which song?",
    songNone: "Not about a particular song",
    songSearchLabel: "Find the song",
    songSearchPlaceholder: "Title or hymn number",
    songSearchEmpty: "No songs match.",
    songClear: "Choose a different song",
    fileLabel: "Which sheet music?",
    fileNone: "Not a particular file",
    leadingLabel: "Which assignment?",
    leadingNone: "You have no upcoming song leading assignments.",
    pageLabel: "Which page?",
    pagePlaceholder: "/song-list",
    contextFrom: "About",
    contextRemove: "Remove",
    submit: "Send request",
    submitting: "Sending…",
    cancel: "Back",
    draftRestored: "We kept your unsent request.",
    characterCount: "{count} / {limit} characters",
    sent: "Request {id} sent. We will reply here.",
  },

  errors: {
    title: "Please write a short summary (up to 120 characters).",
    description: "Please describe it (up to 5,000 characters).",
    link: "Each link must be a full web address beginning with https:// or http://.",
    context: "We could not find what this refers to any more, or you cannot see it. Remove it, or reload the page and try again.",
    contextChanged: "This song list has changed since you opened it. Reload the page and choose the song again.",
    leadingRequired: "Choose the assignment this is about.",
    invalid: "Some of this could not be accepted. Please check it and try again.",
    forbidden: "Your account cannot send support requests.",
    notFound: "This request could not be found.",
    conflict: "Someone changed this request while you were looking at it. The page has been refreshed - please check and try again.",
    closed: "This request is closed, so it cannot be replied to.",
    failed: "Something went wrong. Please try again.",
  },

  list: {
    empty: "You have not sent any requests yet.",
    emptyQueue: "Nothing here.",
    loadMore: "Show more",
    updated: "Updated {time}",
    from: "From {name}",
    assigned: "Assigned to {name}",
    unassigned: "Unassigned",
  },

  queue: {
    views: {
      needs_action: "Needs action",
      unassigned: "Unassigned",
      assigned_to_me: "Assigned to me",
      awaiting_submitter: "Waiting on the sender",
      in_progress: "In progress",
      active: "All open",
      resolved: "Resolved",
      closed: "Closed",
      all: "Everything",
    },
    category: "Kind",
    priority: "Priority",
    any: "Any",
    apply: "Filter",
  },

  detail: {
    back: "Support",
    sent: "Sent {time} by {name}",
    you: "you",
    about: "What it is about",
    reportedAs: "As it was when reported",
    changedSince: "This place now holds a different song.",
    redacted: "The details of this service are not published, so they are hidden here.",
    links: "Links",
    openService: "Open the song list",
    openPlanner: "Open in the Service Planner",
    openSong: "Open the song",
    openPage: "Open the page",
    position: "Song {n}",
    emptyPlace: "An empty place",
    leading: "Leading {songs}",
    conversation: "Conversation",
    internalBadge: "Internal note",
    internalHint: "Only people who manage requests can see this.",
    noMessages: "No replies yet.",
    formerPerson: "A former member",
    music: "The music ministry",
  },

  reply: {
    replyTab: "Reply",
    noteTab: "Internal note",
    replyLabel: "Your reply",
    replyPlaceholder: "Write a reply. The sender will see it.",
    noteLabel: "Internal note",
    notePlaceholder: "Only people who manage requests will see this.",
    afterLabel: "Then",
    after: { keep: "Leave it as it is", request_info: "Ask them for more information", resolve: "Mark it resolved" },
    reopen: "This still needs attention - reopen the request",
    resolvedNote: "This request is resolved. You can still add a comment, or reopen it if the problem is back.",
    closedNote: "This request is closed. If you need more help, start a new request.",
    newRequest: "Start a new request",
    send: "Send reply",
    sendNote: "Add note",
    sending: "Sending…",
    sent: "Reply sent.",
    noteSaved: "Note added.",
  },

  manage: {
    heading: "Manage",
    status: "Status",
    priority: "Priority",
    assignee: "Assigned to",
    nobody: "Nobody",
    claim: "Take it",
    waitingOn: "Waiting on",
    waitingOptions: { management: "The music ministry", submitter: "The sender", none: "Nobody" } satisfies Record<WaitingOn, string>,
    save: "Save changes",
    saving: "Saving…",
    saved: "Saved.",
    reopen: "Reopen",
    notManager: "no longer manages requests",
  },

  /** The history lines. {name} is who did it; {from} and {to} are values. */
  events: {
    created: "{name} sent this request",
    assigned: "{name} assigned it to {to}",
    unassigned: "{name} unassigned it",
    priority_changed: "{name} changed the priority to {to}",
    status_changed: "{name} changed the status to {to}",
    waiting_changed: "{name} set it to {to}",
    resolved: "{name} marked it resolved",
    closed: "{name} closed it",
    reopened: "{name} reopened it",
  },

  /** Report links placed on other pages. */
  report: {
    problem: "Report a problem",
    sheetMusic: "Request sheet music",
    assignment: "Problem with this assignment",
  },

  dashboard: {
    /** [one, many]; {count} is replaced. */
    needsReply: {
      title: ["{count} of your support requests needs your reply", "{count} of your support requests need your reply"],
      detail: "The music ministry asked you something.",
      action: "Reply",
    },
    unassigned: {
      title: ["{count} new support request to review", "{count} support requests nobody has taken"],
      detail: "Nobody has taken these yet.",
      action: "Review",
    },
    needsAction: {
      title: ["{count} support request is waiting on the ministry", "{count} support requests are waiting on the ministry"],
      detail: "Someone is waiting for an answer.",
      assigned: ["{count} is assigned to you.", "{count} are assigned to you."],
      action: "Open requests",
    },
  },

  share: { title: "Music Ministry Support", description: "Report a problem, request sheet music, suggest an idea or ask a question." },
} as const;
