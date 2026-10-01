import { siteConfig } from "@/config/site";

/**
 * Editable copy for member accounts: logging in, requesting an account,
 * accepting an invitation and the account page. Field limits are enforced in
 * src/lib/validation.ts - keep the two in step.
 */
export const accountContent = {
  login: {
    eyebrow: "Members",
    title: "Log in",
    lead: "Accounts are for the musicians and song leaders of the music ministry.",
    /** "Don't have an account? Request one!" - only the link text is a link. */
    noAccount: "Don't have an account?",
    requestLink: "Request one!",
  },

  /** Shown on /login and elsewhere when accounts cannot work in this deployment. */
  unavailable: {
    title: "Accounts are temporarily unavailable",
    body: `Logging in is not working right now. Please try again later, or email ${siteConfig.contactEmail}.`,
  },

  requestAccess: {
    eyebrow: "Members",
    title: "Request an account",
    lead: "Accounts are by invitation. Tell us who you are, and someone from the music ministry will review your request.",
    haveAccount: "Already have an account?",
    loginLink: "Log in",
    form: {
      name: { label: "Name", placeholder: "Your full name" },
      email: { label: "Email", placeholder: "you@example.com" },
      message: {
        label: "Message",
        optional: "Optional",
        placeholder: "How are you involved in the music ministry? (For example: I play violin on Sunday mornings.)",
      },
      submit: "Send Request",
      submitting: "Sending…",
      note: "We only use your email address for your account.",
    },
    success: {
      title: "Request received",
      /**
       * Deliberately the same whatever happened - new request, duplicate, or an
       * address that already has an account - so the form cannot be used to
       * find out who has an account.
       */
      body: "Thank you. If your request can go ahead, you will receive an email invitation to create your account once it has been reviewed. If you already have an account, you can log in now.",
    },
    errorTitle: "Your request could not be sent",
    errorBody: `Something went wrong on our end. Please try again in a moment, or email us at ${siteConfig.contactEmail}.`,
    botBody: `We could not verify this submission. Please email us at ${siteConfig.contactEmail}.`,
  },

  acceptInvite: {
    eyebrow: "Welcome",
    title: "Create your account",
    lead: "You have been invited to join Faithful Word Music. Choose a password to finish setting up your account.",
    noTicket: {
      title: "Accounts are by invitation",
      body: "This page is for accepting an invitation. Open the link in your invitation email to create your account - or, if you do not have one, you can request an account.",
    },
    /** Shown beneath the form for invalid, expired or already-used links. */
    trouble:
      "If the link says it is invalid or expired, it may have already been used or run out. Ask for a new invitation, or log in if you already created your account.",
  },

  /** /profile: the person in the ministry. */
  profile: {
    title: "Your profile",
    edit: "Edit profile",
    editTitle: "Edit profile",
    editLead: "Only you and the ministry's administrators can see your profile.",
    settingsLink: "Account settings",
    /** /profile/edit?welcome=1: a new member's first page, straight after creating their account. */
    welcome: {
      eyebrow: "Welcome",
      title: "Set up your profile",
      lead: "Tell the music ministry a little about yourself. You can change any of this later from your profile.",
      save: "Save and continue",
      skip: "Skip for now",
    },
    completeTitle: "Finish your profile",
    completeBody: "A few details help the music ministry know who plays and sings what.",
  },

  /** /account: how the person signs in (Clerk's screen), and later account-wide settings. */
  settings: {
    eyebrow: "Your account",
    title: "Account settings",
    lead: "Your sign-in email, password and signed-in devices.",
    profileLink: "Your profile",
  },

  /** The avatar menu in the header. */
  menu: {
    button: "Account menu",
    logout: "Log out",
  },

  errors: {
    nameRequired: "Please enter your name.",
    nameTooLong: "Please keep your name under 80 characters.",
    emailRequired: "Please enter your email address.",
    emailInvalid: "Please enter a valid email address.",
    emailTooLong: "Please enter a shorter email address.",
    messageTooLong: "Please keep your message under 1000 characters.",
  },

  /** The email to the ministry when someone asks for an account. */
  notification: {
    subject: "Account request from {name}",
    intro: "Someone has asked for an account on the Faithful Word Music website.",
    review: "Review this request",
    footer:
      "Approving or declining happens on the website after you log in. This email cannot change anything by itself.",
  },
} as const;
