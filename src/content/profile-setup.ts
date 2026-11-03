import { siteConfig } from "@/config/site";
import type { RequirementKey } from "@/lib/auth/profile-requirements";

/**
 * Copy for the profile editor's sections, profile requirements (what is
 * still needed, and by when) and onboarding (/welcome). Dates are filled in
 * with {date}.
 */
export const profileSetupContent = {
  required: "Required",
  optional: "Optional",

  /** How each requirement reads in a list of what is still needed. */
  requirements: {
    name: "Your first and last name",
    instruments: "The instruments you play",
    instrument_proficiency: "How well you play each instrument",
    primary_instrument: "Your primary instrument",
    learning_style: "How you play (by ear or from sheet music)",
    reads_sheet_music: "Whether you read sheet music",
    leading_experience: "Your song-leading skill level",
    leading_unfamiliar: "Leading hymns you don't know well",
    leading_unaccompanied: "Leading without accompaniment",
    availability_reviewed: "Your normal services",
  } satisfies Record<RequirementKey, string>,

  /** The profile's status card, the Dashboard notice and the menu marker. */
  status: {
    completeTitle: "Your profile is complete",
    completeBody: "Thank you. You can change any of it at any time.",
    advisoryTitle: "Finish your profile",
    advisoryBody: "A few details help the music ministry know who plays and leads what.",
    graceTitle: "Please finish your profile by {date}",
    graceBody: "The music ministry now asks everyone for a few details. After {date} you'll need to finish them before using the rest of the site.",
    graceNoDate: "The music ministry now asks everyone for a few details.",
    blockedTitle: "Please finish your profile",
    blockedBody: "A few required details are still missing. Finish them to carry on - it only takes a few minutes.",
    stillNeeded: "Still needed",
    finish: "Finish now",
    menuMarker: "Your profile needs attention",
  },

  sections: {
    about: {
      title: "About you",
      lead: "Your name as the ministry knows you. Everything else here is optional.",
      first: "First name",
      middle: "Middle name",
      last: "Last name",
      preferred: "Preferred name",
      preferredHint: "What people call you",
      phone: "Phone",
      phoneHint: "Only you and administrators see it",
      bio: "About you",
      bioPlaceholder: "A sentence or two about yourself and your part in the music ministry.",
      photo: "Profile photo",
      photoUpload: "Upload photo",
      photoChange: "Change photo",
      photoRemove: "Remove",
      photoChoose: "Choose a profile photo",
      photoWrongType: "Please choose an image file.",
      photoTooLarge: "Please choose an image under 10 MB.",
      photoFailed: "The photo could not be saved. Please try another image.",
    },
    music: {
      title: "Instruments",
      lead: "The instruments you play in services.",
      legend: "Instruments you play",
      legendHint: "Choose each one, then how well you play it and which is your main one.",
      proficiencyPlaceholder: "How well?",
      proficiencyLabel: "How well you play {instrument}",
      primary: "Primary",
      primaryHint: "Your main instrument",
      missing: "Missing an instrument? Ask an administrator to add it to the list.",
    },
    shared: {
      title: "Reading music",
      lead: "Asked once, however many ways you serve.",
      reads: "Can you read sheet music?",
      yes: "Yes",
      no: "No",
      voice: "Voice part",
      theory: "Music theory",
    },
    leading: {
      title: "Song leading",
      lead: "So the music ministry knows how best to support you. This never decides whether you are asked to lead.",
      experience: "Song leading skill level",
      unfamiliar: "How comfortable are you leading hymns you don't know well?",
      unaccompanied: "How comfortable are you leading without accompaniment?",
    },
    availability: {
      title: "Normal services",
      lead: "The services you usually serve at. It is not a promise to lead or play - just when the ministry can usually expect you.",
    },
    save: "Save changes",
    saved: "Saved.",
    unsaved: "Unsaved changes",
    /** Where the Save button would be, while nothing in the section has changed. */
    allSaved: "All changes saved",
    nameFailed: "Your name could not be saved. Please try again.",
    /** {items}: the required answers missing, e.g. "whether you read sheet music". */
    requiredMissing: "Please answer the required questions before saving: {items}.",
    /** The ⓘ beside a question whose choices have descriptions. {question} is replaced. */
    explain: "What the choices mean: {question}",
    /** The dialog asked when leaving with unsaved answers. */
    leave: {
      title: "Leave without saving?",
      body: "Your changes on this page have not been saved yet. If you leave now, they will be lost.",
      stay: "Keep editing",
      leave: "Leave without saving",
    },
  },

  /** /welcome */
  welcome: {
    eyebrow: "Welcome",
    titleNew: `Welcome to ${siteConfig.name}`,
    leadNew: "A few short steps to set up your account. Your answers save as you go, so you can stop and pick up again on any device.",
    titleFocused: "A few details are needed",
    leadFocused: "Only what is missing is asked - everything you have already told us is kept.",
    titleDone: "You're all set",
    leadDone: "Your profile is complete.",
    progress: "Step {n} of {total}",
    ministryLead: "How you serve in the music ministry. Questions shared by more than one role are asked once.",
    steps: {
      about: "About you",
      ministry: "Your ministry",
      availability: "Availability",
      notifications: "Notifications",
      intro: "Your Dashboard",
    },
    stepDone: "Done",
    stepRequired: "Required",
    stepOptional: "Optional",
    continue: "Continue",
    saveContinue: "Save and continue",
    skip: "Skip for now",
    back: "Back",
    toDashboard: "Go to your Dashboard",
    allowedWhileBlocked:
      "While this is unfinished you can still reach your profile, account settings, notification settings and the Support Center.",
    notifications: {
      title: "How you hear from us",
      lead: "Notifications tell you when something you need to know changes - a song list published, a service you lead updated.",
      inApp: "In the app: the bell at the top of every page. Always on for important notices.",
      push: "On this device: alerts even when the site is closed. Only if you switch it on below - your browser will ask first.",
      email: "By email: off unless you choose it.",
      songLeadingEmail: "Email me about song-leading changes",
      songLeadingEmailHint: "Off unless you switch it on. You can change it any time.",
      settingsLink: "All notification settings",
    },
    intro: {
      title: "Your Dashboard",
      lead: "Your home on the site. It shows only what matters to you:",
      points: [
        "Next service - when it is, who leads, and your sheet music.",
        "For you - anything waiting on you.",
        "Later - the rest of the week, and for song leaders, the services you lead.",
        "Availability - your normal services and any changes.",
        "Preparation - playlists, new sheet music and songs to brush up on, when there are any.",
      ],
      replay: "Replay the introduction",
    },
  },

  /** Admin: activating requirements, and one person's deadlines. */
  admin: {
    title: "Profile requirements",
    lead: "When active, everyone is asked for the profile details their roles need. Existing members get seven days from activation; new members finish them as they join.",
    inactive: "Not active in this environment.",
    pending: "Activating - not yet blocking anyone. Press Activate again to finish.",
    active: "Active since {date}. {count} existing accounts were given until {due}.",
    paused: "Paused {date}. Notices still show; nobody is blocked.",
    activate: "Activate",
    activateConfirm:
      "Activate profile requirements in this environment? Existing members will have seven days from now to finish their profiles, after which they must finish before using the site. This cannot be undone, only paused.",
    activated: "Profile requirements are active.",
    resumeActivation: "Finish activating",
    pause: "Pause",
    resume: "Resume",
    pausedDone: "Paused. Nobody is blocked.",
    resumedDone: "Resumed.",
    failed: {
      "accounts-unavailable": "Clerk could not be reached. Nothing is blocked yet - please try again.",
      incomplete: "Not every account could be recorded. Nothing is blocked yet - please try again.",
      failed: "Activation did not finish. Nothing is blocked yet - please try again.",
    },
    person: {
      title: "Profile requirements",
      complete: "Complete.",
      notActive: "Requirements are not active; nothing is enforced.",
      missing: "Missing: {items}.",
      due: "Due {date}.",
      overdue: "Overdue since {date} - they are asked to finish before using the site.",
      extend: "Give 7 more days",
      extended: "They have 7 more days.",
    },
  },
} as const;

export function requirementLabel(key: RequirementKey): string {
  return profileSetupContent.requirements[key];
}
